import {
  getRequestBaseUrl,
  handleOptions,
  parseQuery,
  sendText,
  setCorsHeaders
} from "../_lib/origin.js";
import { checkRateLimit } from "../_lib/security.js";
import { openUpstreamStream, upstreamFetch } from "../_lib/upstream.js";

/**
 * Secure, TLS-Tolerant HLS & MPEG-TS Relay Proxy (/api/proxy):
 *  - Enforces DNS + IP SSRF protection against private/loopback/cloud-metadata addresses
 *  - Supports custom IPTV ports (e.g. :5789, :8080, :25461, :8443) with self-signed TLS certs
 *  - Tracks 301/302 `finalUrl` so relative .m3u8 / .ts URLs resolve against the true redirected host!
 *  - Streams binary .ts / .m4s segments directly via Node stream piping (low memory, ultra-fast!)
 */
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const rl = checkRateLimit(req, "proxy", 450, 60_000);
  if (!rl.allowed) {
    return sendText(res, 429, "Rate limit exceeded");
  }

  const q = parseQuery(req);
  const targetUrl = String(q.u || q.url || "").trim();
  if (!targetUrl) {
    return sendText(res, 400, "Missing stream URL");
  }

  const baseUrl = getRequestBaseUrl(req);
  const customHeaders = {};
  if (q.ua) customHeaders["User-Agent"] = q.ua;
  if (q.ref) customHeaders.Referer = q.ref;
  if (req.headers.range) customHeaders.Range = req.headers.range;

  const pathPart = targetUrl.split("?")[0].toLowerCase();
  const isDashPath = pathPart.endsWith(".mpd");
  const likelyManifest =
    isDashPath ||
    pathPart.endsWith(".m3u8") ||
    pathPart.endsWith(".m3u") ||
    (!/\.(ts|m2ts|m4s|cmfv|cmfa|dash|mp4|m4v|webm|mkv|flv|aac|mp3|m4a|key)$/i.test(pathPart) && q.seg !== "1");

  if (likelyManifest) {
    const fetched = await upstreamFetch(targetUrl, {
      timeoutMs: 9000,
      maxBytes: 1_048_576,
      headers: customHeaders
    });

    if (fetched.blocked) {
      return sendText(res, 403, "Forbidden: disallowed private or internal URL");
    }
    if (!fetched.ok) {
      return sendText(res, fetched.status || 502, `Upstream status ${fetched.status || "unreachable"}`);
    }

    if (!fetched.isBinaryTs && fetched.text) {
      const effectiveBase = fetched.finalUrl || targetUrl;
      if (fetched.text.includes("#EXTM3U")) {
        const rewritten = rewriteManifestForProxy(fetched.text, effectiveBase, baseUrl, q.ref || "");
        return sendText(res, 200, rewritten, "application/vnd.apple.mpegurl; charset=utf-8", "no-store");
      }
      if (fetched.text.includes("<MPD") || (fetched.contentType || "").includes("dash+xml")) {
        const rewrittenMpd = rewriteDashMpdForProxy(fetched.text, effectiveBase, baseUrl, q.ref || "");
        return sendText(res, 200, rewrittenMpd, "application/dash+xml; charset=utf-8", "no-store");
      }
    }

    // Upstream returned binary TS/MP4 segment directly
    setCorsHeaders(res);
    res.statusCode = fetched.status || 200;
    res.setHeader("Content-Type", fetched.contentType || "video/mp2t");
    res.setHeader("Cache-Control", "public, max-age=6");
    res.end(fetched.buffer);
    return;
  }

  // Binary segment streaming pipe (.ts, .m2ts, .m4s, .mp4, .key)
  const opened = await openUpstreamStream(targetUrl, {
    timeoutMs: 11000,
    headers: customHeaders
  });

  if (!opened.ok) {
    const errCode = opened.blocked ? 403 : opened.status || 502;
    return sendText(res, errCode, opened.error || "Stream relay failed");
  }

  setCorsHeaders(res);
  res.statusCode = opened.status;
  res.setHeader("Content-Type", opened.headers["content-type"] || "video/mp2t");
  res.setHeader("Cache-Control", "public, max-age=10");
  if (opened.headers["content-length"]) {
    res.setHeader("Content-Length", opened.headers["content-length"]);
  }
  if (opened.headers["content-range"]) {
    res.setHeader("Content-Range", opened.headers["content-range"]);
  }

  res.on("close", () => {
    try {
      opened.req?.destroy();
    } catch {
      // ignore
    }
  });

  opened.stream.pipe(res);
}

function rewriteManifestForProxy(text, manifestUrl, baseUrl, ref) {
  const refParam = ref ? `&ref=${encodeURIComponent(ref)}` : "";
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return trimmed.replace(/URI="([^"]+)"/gi, (_, uri) => {
          const abs = new URL(uri, manifestUrl).toString();
          return `URI="${baseUrl}/api/proxy?u=${encodeURIComponent(abs)}${refParam}"`;
        });
      }
      const abs = new URL(trimmed, manifestUrl).toString();
      const isSubManifest = abs.split("?")[0].toLowerCase().endsWith(".m3u8");
      const segFlag = isSubManifest ? "" : "&seg=1";
      return `${baseUrl}/api/proxy?u=${encodeURIComponent(abs)}${refParam}${segFlag}`;
    })
    .join("\n");
}

function wrapProxySegmentUrl(rawUri, currentBase, proxyOrigin, refParam) {
  if (!rawUri || rawUri.startsWith("data:") || rawUri.includes("/api/proxy?")) return rawUri;
  // Temporarily shield DASH $Template$ tokens before URL resolution
  const tokens = [];
  const shielded = String(rawUri).replace(/\$([A-Za-z0-9_%]+)\$/g, (_, inner) => {
    const idx = tokens.length;
    tokens.push(inner);
    return `__DASH_TOK_${idx}__`;
  });
  let abs;
  try {
    abs = new URL(shielded, currentBase).toString();
  } catch {
    return rawUri;
  }
  let encoded = encodeURIComponent(abs);
  tokens.forEach((inner, idx) => {
    encoded = encoded.replace(new RegExp(`__DASH_TOK_${idx}__`, "g"), `$${inner}$`);
  });
  return `${proxyOrigin}/api/proxy?seg=1${refParam}&u=${encoded}`;
}

export function rewriteDashMpdForProxy(xmlText, manifestUrl, baseUrl, ref) {
  const refParam = ref ? `&ref=${encodeURIComponent(ref)}` : "";
  let effectiveDir = manifestUrl;

  // Extract top-level <BaseURL> if present so relative segment templates resolve accurately, then strip relative <BaseURL>
  let out = String(xmlText || "").replace(/<BaseURL[^>]*>([^<]+)<\/BaseURL>/gi, (full, inner) => {
    const trimmed = inner.trim();
    try {
      effectiveDir = new URL(trimmed, manifestUrl).toString();
    } catch {
      // keep manifestUrl
    }
    return "";
  });

  // Rewrite initialization="...", media="...", index="..." attributes in SegmentTemplate / SegmentBase / SegmentURL
  out = out.replace(
    /\b(initialization|media|index|sourceURL)="([^"]+)"/gi,
    (_, attr, val) => `${attr}="${wrapProxySegmentUrl(val, effectiveDir, baseUrl, refParam)}"`
  );

  return out;
}
