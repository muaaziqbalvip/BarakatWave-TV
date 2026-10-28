import {
  getRequestBaseUrl,
  handleOptions,
  parseQuery,
  sendText,
  setCorsHeaders
} from "../_lib/origin.js";

function isSafeExternalUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const q = parseQuery(req);
  const targetUrl = String(q.u || q.url || "").trim();
  if (!isSafeExternalUrl(targetUrl)) {
    return sendText(res, 400, "Invalid or disallowed stream URL");
  }

  const baseUrl = getRequestBaseUrl(req);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);

  try {
    const headers = {
      "User-Agent":
        q.ua || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 BarakatWaveTV/2.0",
      Accept: "*/*"
    };
    if (q.ref) headers.Referer = q.ref;
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = await fetch(targetUrl, { signal: ctrl.signal, headers });
    clearTimeout(timer);

    if (!upstream.ok && upstream.status !== 206) {
      return sendText(res, upstream.status, `Upstream status ${upstream.status}`);
    }

    const ct = (upstream.headers.get("content-type") || "").toLowerCase();
    const isManifest =
      ct.includes("mpegurl") ||
      targetUrl.split("?")[0].toLowerCase().endsWith(".m3u8");

    if (isManifest) {
      const text = await upstream.text();
      const rewritten = rewriteManifestForProxy(text, targetUrl, baseUrl, q.ref || "");
      return sendText(res, 200, rewritten, "application/vnd.apple.mpegurl; charset=utf-8", "no-store");
    }

    setCorsHeaders(res);
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", ct || "video/mp2t");
    res.setHeader("Cache-Control", "public, max-age=10");
    const cl = upstream.headers.get("content-length");
    if (cl) res.setHeader("Content-Length", cl);
    const cr = upstream.headers.get("content-range");
    if (cr) res.setHeader("Content-Range", cr);

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (err) {
    clearTimeout(timer);
    return sendText(res, 502, `Stream relay error: ${err?.message || "timeout"}`);
  }
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
      return `${baseUrl}/api/proxy?u=${encodeURIComponent(abs)}${refParam}`;
    })
    .join("\n");
}
