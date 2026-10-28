import { handleOptions, parseBody, sendJson } from "../_lib/origin.js";
import { updateLocalMirrorNode } from "../_lib/rtdb.js";

/**
 * Mirrors client Firebase RTDB updates to the in-process / local cache so
 * immediate Xtream / M3U8 / SEO requests reflect updates with zero delay.
 */
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return sendJson(res, 200, { ok: true, message: "BarakatWave RTDB Sync Active" });
  }
  const body = await parseBody(req);
  const path = String(body.path || "").trim();
  if (!path) {
    return sendJson(res, 400, { ok: false, error: "Missing path" });
  }
  const allowedPrefixes = [
    "channels",
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
  return sendJson(res, 200, { ok: true, synced: path });
}
