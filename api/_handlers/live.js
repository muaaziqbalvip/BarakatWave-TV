import {
  getRequestBaseUrl,
  handleOptions,
  parseQuery,
  sendText,
  setCorsHeaders
} from "../_lib/origin.js";
import { getChannels, getSettings, verifyXtreamCredentials } from "../_lib/rtdb.js";
import { peekChannelInitialSequence } from "../_lib/hls.js";

/**
 * Universal Live Stream Entrypoint:
 *  - Xtream Live streams: /live/:user/:pass/:file  (IPTV Smarters, TiviMate, XCIPTV, VLC, OTT Navigator)
 *  - Legacy Xtream URLs:  /:user/:pass/:id
 *  - Clean Channel M3U8s: /ch/:slug.m3u8
 *
 * Behavior:
 *  1) Free User on PRO VIP Channel -> Plays Continuous Premium Unlock Video (0306-2015326)
 *  2) Free User on FREE Channel (or PRO User on ANY Channel) -> Plays Admin Intro Video FIRST,
 *     then automatically switches DIRECTLY to the Live Channel!
 */
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const q = parseQuery(req);
  const baseUrl = getRequestBaseUrl(req);
  const username = String(q.user || q.username || "").trim();
  const password = String(q.pass || q.password || "").trim();
  const rawFile = String(q.file || q.slug || q.id || "").trim();
  const cleanTarget = rawFile.replace(/\.(m3u8|ts|m2ts|mp4)$/i, "");
  const skipIntro = q.nointro === "1";

  // If an older IPTV client explicitly requested .ts, 302-redirect to .m3u8 so ExoPlayer/VLC activates HLS demuxer!
  if (/\.ts$/i.test(rawFile) && username && password) {
    setCorsHeaders(res);
    res.statusCode = 302;
    res.setHeader(
      "Location",
      `${baseUrl}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(cleanTarget)}.m3u8`
    );
    res.end();
    return;
  }

  let effectivePlan = "free";
  if (username && password) {
    const acct = await verifyXtreamCredentials(username, password);
    if (!acct) {
      const lockStream = `${baseUrl}/api/stream?mode=pro_lock&reason=auth`;
      return sendMasterPlaylist(res, lockStream, "BarakatWave Auth Notice");
    }
    effectivePlan = acct.effectivePlan;
  }

  const [channels, settings] = await Promise.all([getChannels(), getSettings()]);
  const channel =
    channels.find((c) => String(c.streamId) === cleanTarget) ||
    channels.find((c) => c.slug === cleanTarget || c.id === cleanTarget) ||
    channels[0];

  if (!channel) {
    return sendText(res, 404, "#EXTM3U\n#EXT-X-ENDLIST\n", "application/vnd.apple.mpegurl");
  }

  // Case 1: PRO VIP Channel accessed by Free viewer -> Play Continuous Premium Unlock Video!
  if (channel.tier === "pro" && effectivePlan !== "pro") {
    const proLockMediaUrl = `${baseUrl}/api/stream?mode=pro_lock&id=${encodeURIComponent(channel.streamId)}`;
    return sendMasterPlaylist(res, proLockMediaUrl, `${channel.name} - Unlock PRO: 0306-2015326`);
  }

  // Case 2: Allowed Channel -> Stamp session start + initial upstream sequence so Intro plays first, then Live Channel!
  const sessionStartSec = Math.floor(Date.now() / 1000);
  const introEnabled = !skipIntro && settings.welcomeVideoEnabled !== false;
  const u0 = introEnabled ? await peekChannelInitialSequence(channel, baseUrl) : 0;

  const mediaParams = new URLSearchParams({
    mode: "live",
    id: String(channel.streamId),
    st: String(sessionStartSec)
  });
  if (u0 > 0) mediaParams.set("u0", String(u0));
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
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2",NAME="${safeName}"`,
    variantUrl
  ].join("\n") + "\n";

  return sendText(res, 200, body, "application/vnd.apple.mpegurl; charset=utf-8", "no-store");
}
