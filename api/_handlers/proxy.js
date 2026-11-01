import {
  getRequestBaseUrl,
  handleOptions,
  parseQuery,
  sendText,
  setCorsHeaders
} from "../_lib/origin.js";
import {
  checkRateLimit,
  decryptStreamUrl,
  encryptStreamUrl
} from "../_lib/security.js";
import { openUpstreamStream, upstreamFetch } from "../_lib/upstream.js";

/**
 * Secure, Encrypted-Vault HLS, MPEG-DASH & MPEG-TS Relay Proxy (/api/proxy):
 *  - Supports AES-256-GCM encrypted upstream tokens (`?e=v1....`) so ZERO raw backend URLs
 *    or CDN hostnames ever appear in browser DevTools Network tab!
 *  - Supports `&tpl=...` alongside `?e=<encryptedBaseDir>` so DASH `$RepresentationID$` / `$Number$`
 *    template substitutions stay 100% encrypted!
 *  - Enforces DNS + IP SSRF protection against private/loopback/cloud-metadata addresses
 *  - Supports custom IPTV ports (:5789, :8080, :25461, :8443) and binary stream piping
 */
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const rl = checkRateLimit(req, "proxy", 600, 60_000);
  if (!rl.allowed) {
    return sendText(res, 429, "Rate limit exceeded");
  }

  const q = parseQuery(req);
  let targetUrl = "";
  let effectiveRef = String(q.ref || "");
  let effectiveUa = String(q.ua || "");
  let encryptedMode = false;

  if (q.e) {
    const unlocked = decryptStreamUrl(q.e);
    if (!unlocked || !unlocked.url) {
      return sendText(res, 403, "Invalid or expired encrypted stream token");
    }
    encryptedMode = true;
    targetUrl = unlocked.url;
    if (q.tpl) {
      try {
        const rawTpl = String(q.tpl);
        targetUrl = new URL(rawTpl, unlocked.url).toString();
      } catch {
        return sendText(res, 400, "Malformed DASH segment template");
      }
    }
    if (!effectiveRef && unlocked.ref) effectiveRef = unlocked.ref;
    if (!effectiveUa && unlocked.ua) effectiveUa = unlocked.ua;
  } else {
    targetUrl = String(q.u || q.url || "").trim();
  }

  if (!targetUrl) {
    return sendText(res, 400, "Missing stream URL");
  }

  const baseUrl = getRequestBaseUrl(req);
  const customHeaders = {};
  if (effectiveUa) customHeaders["User-Agent"] = effectiveUa;
  if (effectiveRef) customHeaders.Referer = effectiveRef;
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
        const rewritten = rewriteManifestForProxy(fetched.text, effectiveBase, baseUrl, effectiveRef, {
          encrypt: encryptedMode
        });
        return sendText(res, 200, rewritten, "application/vnd.apple.mpegurl; charset=utf-8", "no-store");
      }
      if (fetched.text.includes("<MPD") || (fetched.contentType || "").includes("dash+xml")) {
        const rewrittenMpd = rewriteDashMpdForProxy(fetched.text, effectiveBase, baseUrl, effectiveRef, {
          encrypt: encryptedMode
        });
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

function buildProxyLink(absUrl, baseUrl, ref, { isSeg = false, encrypt = false } = {}) {
  const segSuffix = isSeg ? "&seg=1" : "";
  if (encrypt) {
    const tok = encryptStreamUrl(absUrl, { ref, ttlSec: 10800 });
    return `${baseUrl}/api/proxy?e=${encodeURIComponent(tok)}${segSuffix}`;
  }
  const refParam = ref ? `&ref=${encodeURIComponent(ref)}` : "";
  return `${baseUrl}/api/proxy?u=${encodeURIComponent(absUrl)}${refParam}${segSuffix}`;
}

export function rewriteManifestForProxy(text, manifestUrl, baseUrl, ref = "", { encrypt = false } = {}) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return trimmed.replace(/URI="([^"]+)"/gi, (_, uri) => {
          const abs = new URL(uri, manifestUrl).toString();
          return `URI="${buildProxyLink(abs, baseUrl, ref, { isSeg: false, encrypt })}"`;
        });
      }
      const abs = new URL(trimmed, manifestUrl).toString();
      const isSubManifest = abs.split("?")[0].toLowerCase().endsWith(".m3u8");
      return buildProxyLink(abs, baseUrl, ref, { isSeg: !isSubManifest, encrypt });
    })
    .join("\n");
}

function wrapProxySegmentUrl(rawUri, currentBase, proxyOrigin, ref, encrypt = false) {
  if (!rawUri || rawUri.startsWith("data:") || rawUri.includes("/api/proxy?")) return rawUri;

  const hasDashTemplate = /\$[A-Za-z0-9_%]+\$/.test(String(rawUri));

  if (encrypt) {
    if (hasDashTemplate) {
      // Encrypt ONLY the base directory URL and pass the relative DASH template (`$RepresentationID$`, `$Number$`) in `&tpl=`!
      const encBase = encryptStreamUrl(currentBase, { ref, ttlSec: 10800 });
      const tokens = [];
      const shielded = String(rawUri).replace(/\$([A-Za-z0-9_%]+)\$/g, (_, inner) => {
        const idx = tokens.length;
        tokens.push(inner);
        return `__DASH_TOK_${idx}__`;
      });
      let tplEncoded = encodeURIComponent(shielded);
      tokens.forEach((inner, idx) => {
        // IMPORTANT: DASH tokens must stay byte-identical (`$RepresentationID$`, `$Number%05d$`, `$Time$`)
        // because Shaka/hls.js substitute them client-side. `%05` is not a valid percent-escape, so
        // WHATWG URL parsers (browsers + Node) preserve it literally inside the query string.
        tplEncoded = tplEncoded.replace(new RegExp(`__DASH_TOK_${idx}__`, "g"), `$${inner}$`);
      });
      return `${proxyOrigin}/api/proxy?seg=1&e=${encodeURIComponent(encBase)}&tpl=${tplEncoded}`;
    }

    try {
      const abs = new URL(rawUri, currentBase).toString();
      const encTok = encryptStreamUrl(abs, { ref, ttlSec: 10800 });
      return `${proxyOrigin}/api/proxy?seg=1&e=${encodeURIComponent(encTok)}`;
    } catch {
      return rawUri;
    }
  }

  const refParam = ref ? `&ref=${encodeURIComponent(ref)}` : "";
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

export function rewriteDashMpdForProxy(xmlText, manifestUrl, baseUrl, ref = "", { encrypt = false } = {}) {
  let effectiveDir = manifestUrl;

  let out = String(xmlText || "").replace(/<BaseURL[^>]*>([^<]+)<\/BaseURL>/gi, (_, inner) => {
    const trimmed = inner.trim();
    try {
      effectiveDir = new URL(trimmed, manifestUrl).toString();
    } catch {
      // keep manifestUrl
    }
    return "";
  });

  out = out.replace(
    /\b(initialization|media|index|sourceURL)="([^"]+)"/gi,
    (_, attr, val) => `${attr}="${wrapProxySegmentUrl(val, effectiveDir, baseUrl, ref, encrypt)}"`
  );

  return out;
}
