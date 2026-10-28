import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleOptions, parseBody, parseQuery, sendJson } from "./_lib/origin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");

async function probeSingleUrl(rawUrl) {
  const url = String(rawUrl || "").trim();
  const start = Date.now();
  if (!url) return { url, ok: false, status: 0, latencyMs: 0, error: "Empty URL" };

  if (url.startsWith("/")) {
    const cleanRel = url.split("?")[0].replace(/^\/+/, "");
    const disk = path.join(PUBLIC_DIR, cleanRel);
    const exists = fs.existsSync(disk);
    return {
      url,
      ok: exists,
      status: exists ? 200 : 404,
      latencyMs: Date.now() - start + 1,
      isHls: cleanRel.endsWith(".m3u8"),
      local: true,
      error: exists ? null : "Local media file missing"
    };
  }

  if (!/^https?:\/\//i.test(url)) {
    return { url, ok: false, status: 0, latencyMs: 0, error: "Must start with http://, https://, or /" };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BarakatWaveProbe/2.0",
        Accept: "*/*"
      }
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { url, ok: false, status: res.status, latencyMs, error: `HTTP ${res.status}` };
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    let sample = "";
    if (ct.includes("mpegurl") || ct.includes("text") || url.toLowerCase().includes(".m3u8")) {
      sample = (await res.text()).slice(0, 1200);
    }
    const isHls = sample.includes("#EXTM3U") || ct.includes("mpegurl") || url.toLowerCase().includes(".m3u8");
    return {
      url,
      ok: true,
      status: res.status,
      latencyMs,
      isHls,
      hasVariants: sample.includes("#EXT-X-STREAM-INF"),
      error: null
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      url,
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      error: err?.name === "AbortError" ? "Timeout (5s)" : err?.message || "Network unreachable"
    };
  }
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const q = parseQuery(req);
  const body = req.method === "POST" ? await parseBody(req) : {};
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
  const results = await Promise.all(capped.map((u) => probeSingleUrl(u)));
  return sendJson(res, 200, { ok: true, count: results.length, results });
}
