import {
  getRequestBaseUrl,
  handleOptions,
  parseBody,
  parseQuery,
  sendJson
} from "../_lib/origin.js";
import { checkRateLimit } from "../_lib/security.js";
import { isClientDirectIptvUrl, upstreamFetch } from "../_lib/upstream.js";

const KNOWN_LOCAL_STREAMS = new Set([
  "/media/welcome/index.m3u8",
  "/media/channel-offline/index.m3u8",
  "/media/coming-soon/index.m3u8",
  "/media/pro-unlock/index.m3u8",
  "/media/demo-live/index.m3u8"
]);

async function probeSingleUrl(rawUrl, baseUrl) {
  const url = String(rawUrl || "").trim();
  const start = Date.now();
  if (!url) return { url, ok: false, status: 0, latencyMs: 0, error: "Empty URL" };

  const cleanLocal = url.split("?")[0];
  if (KNOWN_LOCAL_STREAMS.has(cleanLocal)) {
    return {
      url,
      ok: true,
      status: 200,
      latencyMs: 1,
      isHls: true,
      local: true,
      error: null
    };
  }

  const isLocalOrigin = url.startsWith("/");
  const effectiveUrl = isLocalOrigin ? `${baseUrl}${url}` : url;
  if (!/^https?:\/\//i.test(effectiveUrl)) {
    return { url, ok: false, status: 0, latencyMs: 0, error: "Must start with http://, https://, or /" };
  }

  const res = await upstreamFetch(effectiveUrl, {
    timeoutMs: 5500,
    maxBytes: 32_768,
    allowLocalOrigin: isLocalOrigin
  });
  const latencyMs = Date.now() - start;

  if (res.blocked) {
    return { url, ok: false, status: 0, latencyMs, error: res.error || "Disallowed host" };
  }

  if (res.ok || res.isBinaryTs) {
    const sample = String(res.text || "").slice(0, 2000);
    const isHls =
      sample.includes("#EXTM3U") ||
      (res.contentType || "").includes("mpegurl") ||
      effectiveUrl.toLowerCase().includes(".m3u8");
    return {
      url,
      finalUrl: res.finalUrl || effectiveUrl,
      ok: true,
      status: res.status || 200,
      latencyMs,
      isHls,
      isMpegTs: Boolean(res.isBinaryTs),
      directPanelMode: isClientDirectIptvUrl(url),
      hasVariants: sample.includes("#EXT-X-STREAM-INF"),
      error: null
    };
  }

  // If an IPTV panel on custom port (:5789/:8080) returns 401/403 to cloud datacenter IPs while DNS is alive,
  // inform Admin that Direct Televizo/IPTV Client Handoff is active and ready!
  if ((res.status === 401 || res.status === 403) && res.dnsAlive && isClientDirectIptvUrl(url)) {
    return {
      url,
      ok: true,
      status: res.status,
      latencyMs,
      isHls: true,
      directPanelMode: true,
      note: "IP-locked panel detected — Direct Televizo/IPTV Client Mode enabled automatically",
      error: null
    };
  }

  return {
    url,
    ok: false,
    status: res.status || 0,
    latencyMs,
    error: res.status ? `HTTP ${res.status}` : res.error || "Network unreachable"
  };
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const rl = checkRateLimit(req, "probe", 60, 60_000);
  if (!rl.allowed) {
    return sendJson(res, 429, { ok: false, error: "Too many probe requests — please wait a moment." });
  }

  const q = parseQuery(req);
  const body = req.method === "POST" ? await parseBody(req) : {};
  const baseUrl = getRequestBaseUrl(req);
  const urls = Array.isArray(body.urls)
    ? body.urls
    : q.url
      ? [q.url]
      : body.url
        ? [body.url]
        : [];

  if (!urls.length) {
    return sendJson(res, 400, { ok: false, error: "Provide url or urls[]" });
  }

  const capped = urls.slice(0, 40);
  const results = await Promise.all(capped.map((u) => probeSingleUrl(u, baseUrl)));
  return sendJson(res, 200, { ok: true, count: results.length, results });
}
