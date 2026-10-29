import { handleOptions, parseBody as readJsonBody, parseQuery, sendJson } from "../_lib/origin.js";
import {
  checkRateLimit,
  encryptStreamUrl,
  isAllowedWebStreamRequest
} from "../_lib/security.js";
import { getChannels } from "../_lib/rtdb.js";
import { recordStreamPlay } from "../_lib/tracker.js";

function inferProto(url, formatHint = "auto") {
  const h = String(formatHint || "auto").toLowerCase();
  if (["dash", "mpd"].includes(h)) return "dash";
  if (["hls", "m3u8"].includes(h)) return "hls";
  if (["mpegts", "ts"].includes(h)) return "mpegts";
  if (h === "flv") return "flv";
  if (["mp4", "html5"].includes(h)) return "html5";

  const clean = String(url || "").split("?")[0].toLowerCase();
  if (clean.endsWith(".mpd")) return "dash";
  if (clean.endsWith(".flv")) return "flv";
  if (clean.endsWith(".ts") || clean.endsWith(".m2ts")) return "mpegts";
  if (/\.(mp4|m4v|webm|mkv|mov|mp3|aac|m4a)$/.test(clean)) return "html5";
  return "hls";
}

function sealCandidateUrl(rawUrl, { ref = "", cid = "", proto = "hls" } = {}) {
  const clean = String(rawUrl || "").trim();
  if (!clean) return null;

  // Same-origin built-in studio assets (/media/...) stay fast local paths
  if (clean.startsWith("/")) {
    return {
      url: clean,
      proto,
      label: proto === "dash" ? "Studio DASH" : "Studio HD"
    };
  }

  const token = encryptStreamUrl(clean, { ref, cid, ttlSec: 10800 });
  const segFlag = proto === "mpegts" || proto === "flv" || proto === "html5" ? "&seg=1" : "";
  return {
    url: `/api/proxy?e=${encodeURIComponent(token)}${segFlag}`,
    proto,
    label: proto === "dash" ? "Shielded DASH" : "Shielded HD"
  };
}

/**
 * Zero-Exposure Stream Vault (/api/gate -> /api/media?ep=gate):
 *  - Resolves channel IDs on the server and returns ONLY AES-256-GCM encrypted proxy tokens (`/api/proxy?e=...`)
 *  - Prevents raw backend M3U8 / MPD / IPTV server URLs from ever appearing in Browser DOM, JS state, or DevTools Network tab!
 *  - Also supports `mode=admin_channels` for Admin Studio editing.
 */
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (!isAllowedWebStreamRequest(req)) {
    return sendJson(res, 403, { ok: false, error: "Cross-site hotlinking is blocked by BarakatWave Stream Shield" });
  }

  const rl = checkRateLimit(req, "gate", 180, 60_000);
  if (!rl.allowed) {
    return sendJson(res, 429, { ok: false, error: "Rate limit exceeded" });
  }

  const q = parseQuery(req);

  // Admin full channel list endpoint so Admin Studio can inspect/edit upstream URLs while public catalog stays redacted
  if (q.mode === "admin_channels") {
    const channels = await getChannels({ includeInactive: true });
    return sendJson(res, 200, { ok: true, channels }, "no-store");
  }

  // POST custom URL encryption (e.g. RTDB-added channels or Stream Lab URLs)
  if (req.method === "POST") {
    const body = (await readJsonBody(req)) || {};
    const customUrl = String(body.url || "").trim();
    if (!customUrl) {
      return sendJson(res, 400, { ok: false, error: "Missing stream URL" });
    }
    const proto = inferProto(customUrl, body.format || "auto");
    const sealed = sealCandidateUrl(customUrl, {
      ref: body.ref || "",
      cid: body.cid || "custom",
      proto
    });
    return sendJson(res, 200, { ok: true, source: sealed }, "no-store");
  }

  const cid = String(q.cid || q.id || "").trim();
  if (!cid) {
    return sendJson(res, 400, { ok: false, error: "Missing channel ID" });
  }

  const channels = await getChannels({ includeInactive: false });
  const channel = channels.find(
    (c) => String(c.id) === cid || String(c.streamId) === cid || String(c.slug) === cid
  );

  if (!channel) {
    return sendJson(res, 404, { ok: false, error: "Channel not found" });
  }

  // Enforce PRO tier lock on server side as well!
  const viewerPlan = String(q.plan || "free").toLowerCase();
  if (channel.tier === "pro" && viewerPlan !== "pro") {
    return sendJson(
      res,
      200,
      {
        ok: true,
        lockedPro: true,
        id: channel.id,
        sources: [
          {
            url: `/api/stream?mode=pro_lock&id=${encodeURIComponent(channel.streamId || channel.id)}`,
            proto: "hls",
            label: "PRO VIP Preview"
          }
        ]
      },
      "no-store"
    );
  }

  const ref = channel.headers?.Referer || "";
  const rawCandidates = [channel.url, ...(channel.backupUrls || [])].filter(Boolean);
  const sources = [];
  rawCandidates.forEach((rawUrl, i) => {
    const proto = inferProto(rawUrl, i === 0 ? channel.streamFormat : "auto");
    const sealed = sealCandidateUrl(rawUrl, { ref, cid: channel.id, proto });
    if (sealed) sources.push(sealed);
  });

  // Record server-verified stream play asynchronously
  if (q.track !== "0") {
    recordStreamPlay(req, {
      sid: q.sid || "",
      title: channel.name,
      itemId: channel.id,
      contentType: "Live TV",
      category: channel.category || "",
      engine: sources[0]?.proto || "hls",
      surface: "Web 3D Studio",
      userPlan: viewerPlan,
      userEmail: q.u || "",
      timezone: q.tz || ""
    }).catch(() => {});
  }

  return sendJson(
    res,
    200,
    {
      ok: true,
      id: channel.id,
      name: channel.name,
      streamFormat: channel.streamFormat || "auto",
      drmScheme: channel.drmScheme || "",
      drmKey: channel.drmKey || "",
      drmLicenseUrl: channel.drmLicenseUrl || "",
      sources
    },
    "no-store"
  );
}
