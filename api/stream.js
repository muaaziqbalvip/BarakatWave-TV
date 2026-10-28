import {
  getRequestBaseUrl,
  handleOptions,
  parseQuery,
  sendText
} from "./_lib/origin.js";
import {
  getChannels,
  getSettings,
  verifyXtreamCredentials
} from "./_lib/rtdb.js";
import {
  buildChannelLiveMediaM3u8,
  buildLoopingLiveM3u8,
  loadClipSegments
} from "./_lib/hls.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const q = parseQuery(req);
  const baseUrl = getRequestBaseUrl(req);
  const mode = String(q.mode || "live");
  const streamId = String(q.id || "1001");
  const sessionStartSec = parseInt(String(q.st || "0"), 10) || 0;
  const skipIntro = q.nointro === "1";

  const [settings, channels] = await Promise.all([getSettings(), getChannels()]);

  // Mode 1: Continuous Live-Stitched Premium Unlock Broadcast Video (0306-2015326)
  if (mode === "pro_lock") {
    const proVideoUrl =
      settings.proUnlockVideoEnabled !== false
        ? settings.proUnlockVideoUrl || "/media/pro-unlock/index.m3u8"
        : "/media/pro-unlock/index.m3u8";
    const proSegs = await loadClipSegments(proVideoUrl, baseUrl, "/media/pro-unlock/index.m3u8");
    const m3u8 = buildLoopingLiveM3u8(proSegs, 6);
    return sendText(res, 200, m3u8, "application/vnd.apple.mpegurl; charset=utf-8", "no-store");
  }

  // Mode 2: Live Channel (with optional Welcome Pre-Roll #EXT-X-DISCONTINUITY stitching)
  const channel =
    channels.find((c) => String(c.streamId) === streamId || c.slug === streamId || c.id === streamId) ||
    channels[0];

  if (!channel) {
    return sendText(res, 404, "#EXTM3U\n#EXT-X-ENDLIST\n", "application/vnd.apple.mpegurl");
  }

  // Enforce PRO tier check on direct stream calls too
  if (channel.tier === "pro") {
    let allowed = false;
    if (q.u && q.p) {
      const acct = await verifyXtreamCredentials(q.u, q.p);
      if (acct && acct.effectivePlan === "pro") allowed = true;
    }
    if (!allowed) {
      const proSegs = await loadClipSegments(
        settings.proUnlockVideoUrl || "/media/pro-unlock/index.m3u8",
        baseUrl,
        "/media/pro-unlock/index.m3u8"
      );
      const m3u8 = buildLoopingLiveM3u8(proSegs, 6);
      return sendText(res, 200, m3u8, "application/vnd.apple.mpegurl; charset=utf-8", "no-store");
    }
  }

  const m3u8 = await buildChannelLiveMediaM3u8({
    channel,
    settings,
    baseUrl,
    sessionStartSec,
    skipIntro
  });
  return sendText(res, 200, m3u8, "application/vnd.apple.mpegurl; charset=utf-8", "no-store");
}
