import {
  getRequestBaseUrl,
  handleOptions,
  parseQuery,
  sendText
} from "./_lib/origin.js";
import { getChannels, verifyXtreamCredentials } from "./_lib/rtdb.js";

/**
 * Handles both:
 *  - Xtream Live streams: /live/:user/:pass/:file  (rewritten to /api/live?user=...&pass=...&file=...)
 *  - Clean Channel M3U8s: /ch/:slug.m3u8          (rewritten to /api/live?slug=...)
 */
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const q = parseQuery(req);
  const baseUrl = getRequestBaseUrl(req);
  const username = String(q.user || q.username || "").trim();
  const password = String(q.pass || q.password || "").trim();
  const rawFile = String(q.file || q.slug || q.id || "").trim();
  const cleanTarget = rawFile.replace(/\.(m3u8|ts|mp4)$/i, "");
  const skipIntro = q.nointro === "1";

  let effectivePlan = "free";
  if (username && password) {
    const acct = await verifyXtreamCredentials(username, password);
    if (!acct) {
      // Serve Pro/Auth info broadcast instead of crashing IPTV players
      const lockStream = `${baseUrl}/api/stream?mode=pro_lock&reason=auth`;
      return sendMasterPlaylist(res, lockStream, "BarakatWave Auth Notice");
    }
    effectivePlan = acct.effectivePlan;
  } else if (String(q.plan || "").toLowerCase() === "pro" && q.uid) {
    // Verified web session token check handled via RTDB user lookup if provided
    effectivePlan = "free";
  }

  const channels = await getChannels();
  const channel =
    channels.find((c) => String(c.streamId) === cleanTarget) ||
    channels.find((c) => c.slug === cleanTarget || c.id === cleanTarget) ||
    channels[0];

  if (!channel) {
    return sendText(res, 404, "#EXTM3U\n#EXT-X-ENDLIST\n", "application/vnd.apple.mpegurl");
  }

  // Check if channel is PRO VIP and viewer is Free
  if (channel.tier === "pro" && effectivePlan !== "pro") {
    const proLockMediaUrl = `${baseUrl}/api/stream?mode=pro_lock&id=${encodeURIComponent(channel.streamId)}`;
    return sendMasterPlaylist(res, proLockMediaUrl, `${channel.name} - Unlock PRO: 0306-2015326`);
  }

  // Stamp stateless session start epoch so Welcome Intro Video plays once at stream start and seamlessly transitions to Live!
  const sessionStartSec = Math.floor(Date.now() / 1000);
  const mediaParams = new URLSearchParams({
    mode: "live",
    id: String(channel.streamId),
    st: String(sessionStartSec)
  });
  if (username) mediaParams.set("u", username);
  if (password) mediaParams.set("p", password);
  if (skipIntro) mediaParams.set("nointro", "1");

  const liveMediaUrl = `${baseUrl}/api/stream?${mediaParams.toString()}`;
  return sendMasterPlaylist(res, liveMediaUrl, channel.name);
}

function sendMasterPlaylist(res, variantUrl, streamName) {
  const safeName = String(streamName || "BarakatWave HD").replace(/"/g, "'");
  const body = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2",NAME="${safeName}"`,
    variantUrl
  ].join("\n") + "\n";

  return sendText(res, 200, body, "application/vnd.apple.mpegurl; charset=utf-8", "no-store");
}
