import { handleOptions, parseBody as readJsonBody, parseQuery, sendJson } from "../_lib/origin.js";
import { checkRateLimit } from "../_lib/security.js";
import {
  clearAllAnalytics,
  getAnalyticsDashboardSnapshot,
  recordStreamPlay,
  recordVisitorSession
} from "../_lib/tracker.js";

/**
 * Real-Time Visitor & Stream Playback Analytics Endpoint (/api/analytics -> /api/admin?ep=analytics)
 */
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const rl = checkRateLimit(req, "analytics", 240, 60_000);
  if (!rl.allowed) {
    return sendJson(res, 429, { ok: false, error: "Rate limit exceeded" });
  }

  const q = parseQuery(req);

  if (req.method === "GET") {
    const snap = await getAnalyticsDashboardSnapshot();
    return sendJson(res, 200, snap, "no-store");
  }

  if (req.method === "DELETE" || q.action === "clear") {
    await clearAllAnalytics();
    return sendJson(res, 200, { ok: true, cleared: true });
  }

  if (req.method === "POST") {
    const body = (await readJsonBody(req)) || {};
    const evtType = String(body.type || q.type || "heartbeat").toLowerCase();

    if (evtType === "clear") {
      await clearAllAnalytics();
      return sendJson(res, 200, { ok: true, cleared: true });
    }

    if (evtType === "play" || evtType === "play_progress") {
      const rec = await recordStreamPlay(req, body);
      return sendJson(res, 200, { ok: true, playId: rec.id });
    }

    const session = await recordVisitorSession(req, {
      ...body,
      leaving: evtType === "leave"
    });
    return sendJson(res, 200, { ok: true, sid: session.sid });
  }

  return sendJson(res, 405, { ok: false, error: "Method not allowed" });
}
