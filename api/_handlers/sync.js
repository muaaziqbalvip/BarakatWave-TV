import { handleOptions, parseBody, sendJson } from "../_lib/origin.js";
import { updateLocalMirrorNode } from "../_lib/rtdb.js";
import { clearDeliveryCache } from "../_lib/hls.js";
import { checkRateLimit } from "../_lib/security.js";

/**
 * Mirrors client Firebase RTDB updates to the in-process / local cache so
 * immediate Xtream / M3U8 / SEO requests reflect updates with zero delay.
 */
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return sendJson(res, 200, { ok: true, message: "BarakatWave RTDB Sync Active" });
  }

  const rl = checkRateLimit(req, "sync", 90, 60_000);
  if (!rl.allowed) {
    return sendJson(res, 429, { ok: false, error: "Too many sync requests" });
  }

  const body = await parseBody(req);
  const path = String(body.path || "").trim();
  if (!path || path.includes("..")) {
    return sendJson(res, 400, { ok: false, error: "Invalid path" });
  }
  const allowedPrefixes = [
    "channels",
    "movies",
    "series",
    "settings/defaults",
    "xtreamAccounts/",
    "playlists/",
    "blogs",
    "reviews"
  ];
  if (!allowedPrefixes.some((p) => path === p || path.startsWith(p))) {
    return sendJson(res, 403, { ok: false, error: "Path not mirrorable" });
  }
  updateLocalMirrorNode(path, body.value);
  clearDeliveryCache();
  return sendJson(res, 200, { ok: true, synced: path });
}
