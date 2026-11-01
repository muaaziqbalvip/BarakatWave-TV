import {
  getRequestBaseUrl,
  handleOptions,
  parseQuery,
  sendText,
  setCorsHeaders
} from "../_lib/origin.js";
import {
  getChannels,
  getMovies,
  getSeries,
  getSettings,
  verifyXtreamCredentials
} from "../_lib/rtdb.js";
import { classifyChannelDelivery } from "../_lib/hls.js";

/**
 * Universal Live, Movie (VOD) & Series Stream Entrypoint:
 *  - Xtream Live streams:   /live/:user/:pass/:file   (Televizo, IPTV Smarters, TiviMate, XCIPTV, VLC)
 *  - Xtream VOD Movies:     /movie/:user/:pass/:file  (2000–2026 IMDb Movies — Coming Soon or custom URL!)
 *  - Xtream TV Series:      /series/:user/:pass/:file (2000–2026 IMDb Series — Coming Soon or custom URL!)
 *  - Clean Channel M3U8s:   /ch/:slug.m3u8
 */
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const q = parseQuery(req);
  const baseUrl = getRequestBaseUrl(req);
  const kind = String(q.kind || "live").toLowerCase();
  const username = String(q.user || q.username || "").trim();
  const password = String(q.pass || q.password || "").trim();
  const rawFile = String(q.file || q.slug || q.id || "").trim();
  const extMatch = rawFile.match(/\.([a-z0-9]+)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : "m3u8";
  const cleanTarget = rawFile.replace(/\.(m3u8|ts|m2ts|mp4|mkv|avi)$/i, "");
  const skipIntro = q.nointro === "1";

  let effectivePlan = "free";
  if (username && password) {
    const acct = await verifyXtreamCredentials(username, password);
    if (!acct) {
      if (kind === "movie" || kind === "series") {
        return redirect302(res, `${baseUrl}/media/pro-unlock/video.mp4`);
      }
      const lockStream = `${baseUrl}/api/stream?mode=pro_lock&reason=auth`;
      return sendMasterPlaylist(res, lockStream, "BarakatWave Auth Notice");
    }
    effectivePlan = acct.effectivePlan;
  }

  const settings = await getSettings();

  // ==================== VOD MOVIES & SERIES PLAYBACK ====================
  if (kind === "movie" || kind === "series") {
    let customStreamUrl = "";
    let itemTier = "free";

    if (kind === "movie") {
      const movies = await getMovies();
      const movie = movies.find(
        (m) => String(m.streamId) === cleanTarget || m.imdbId === cleanTarget || m.id === cleanTarget
      );
      if (movie) {
        customStreamUrl = String(movie.streamUrl || "").trim();
        itemTier = movie.tier || "free";
      }
    } else {
      const seriesList = await getSeries();
      for (const s of seriesList) {
        const ep = (s.episodes || []).find((e) => String(e.id) === cleanTarget);
        if (ep) {
          customStreamUrl = String(ep.streamUrl || s.streamUrl || "").trim();
          itemTier = s.tier || "free";
          break;
        }
        if (String(s.seriesId) === cleanTarget || s.imdbId === cleanTarget) {
          customStreamUrl = String(s.streamUrl || "").trim();
          itemTier = s.tier || "free";
          break;
        }
      }
    }

    if (itemTier === "pro" && effectivePlan !== "pro") {
      if (ext === "m3u8") {
        return sendMasterPlaylist(res, `${baseUrl}/api/stream?mode=pro_lock`, "Unlock PRO VIP: 0306-2015326");
      }
      const proMp4 = resolveMediaMp4Url(settings.proUnlockVideoUrl, "/media/pro-unlock/video.mp4", baseUrl);
      return redirect302(res, proMp4);
    }

    if (customStreamUrl) {
      const absUrl = customStreamUrl.startsWith("/") ? `${baseUrl}${customStreamUrl}` : customStreamUrl;
      return redirect302(res, absUrl);
    }

    if (ext === "m3u8") {
      return sendMasterPlaylist(
        res,
        `${baseUrl}/api/stream?mode=coming_soon`,
        "BarakatWave Cinema — Service is Building (Coming Soon)"
      );
    }
    const comingSoonMp4 = resolveMediaMp4Url(
      settings.comingSoonVideoUrl,
      "/media/coming-soon/video.mp4",
      baseUrl
    );
    return redirect302(res, comingSoonMp4);
  }

  // ==================== LIVE TV PLAYBACK ====================
  const channels = await getChannels();
  const channel = cleanTarget
    ? channels.find((c) => String(c.streamId) === cleanTarget) ||
      channels.find((c) => c.slug === cleanTarget || c.id === cleanTarget)
    : channels[0];

  if (!channel) {
    if (ext === "ts" && username && password) {
      return redirect302(
        res,
        `${baseUrl}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(cleanTarget)}.m3u8`
      );
    }
    const offlineMediaUrl = `${baseUrl}/api/stream?mode=offline`;
    return sendMasterPlaylist(res, offlineMediaUrl, "Channel Offline — BarakatWave TV");
  }

  // Case 1: PRO VIP Channel accessed by Free viewer -> Play Continuous Premium Unlock Video!
  if (channel.tier === "pro" && effectivePlan !== "pro") {
    if (ext === "ts" && username && password) {
      return redirect302(
        res,
        `${baseUrl}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(cleanTarget)}.m3u8`
      );
    }
    const proLockMediaUrl = `${baseUrl}/api/stream?mode=pro_lock&id=${encodeURIComponent(channel.streamId)}`;
    return sendMasterPlaylist(res, proLockMediaUrl, `${channel.name} - Unlock PRO: 0306-2015326`);
  }

  // Case 2: Smart Delivery Classification (cached 45s for <2ms speed!):
  //  - Direct 302 Handoff for custom-port IPTV panels (e.g. https://live.nowiretv.com:5789/live/auto/3383.m3u8),
  //    Flussonic /live/auto/, per-IP tokenized streams, or residential-only ISP streams so Televizo plays 100%!
  //  - Channel Offline Standby Video when all candidate URLs are genuinely 404 / 5xx / dead!
  //  - 3-Phase Televizo Intro -> Live Channel Stitched HLS for public CDN & local broadcast streams!
  const delivery = await classifyChannelDelivery(channel, settings, { skipIntro });

  if (delivery.mode === "direct" && delivery.url) {
    return redirect302(res, delivery.url);
  }

  if (ext === "ts" && username && password) {
    return redirect302(
      res,
      `${baseUrl}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(cleanTarget)}.m3u8`
    );
  }

  if (delivery.mode === "offline") {
    const offlineMediaUrl = `${baseUrl}/api/stream?mode=offline&id=${encodeURIComponent(channel.streamId)}`;
    return sendMasterPlaylist(res, offlineMediaUrl, `${channel.name} — Signal Restoring`);
  }

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

function resolveMediaMp4Url(configuredUrl, fallbackMp4Path, baseUrl) {
  const val = String(configuredUrl || "").trim();
  if (/^https?:\/\//i.test(val) && !val.endsWith(".m3u8")) return val;
  if (val.startsWith("/") && val.endsWith(".mp4")) return `${baseUrl}${val}`;
  return `${baseUrl}${fallbackMp4Path}`;
}

function redirect302(res, targetUrl) {
  setCorsHeaders(res);
  res.statusCode = 302;
  res.setHeader("Location", targetUrl);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

function sendMasterPlaylist(res, variantUrl, streamName) {
  const safeName = String(streamName || "BarakatWave HD").replace(/"/g, "'");
  const body = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,NAME="${safeName}"`,
    variantUrl
  ].join("\n") + "\n";

  return sendText(res, 200, body, "application/vnd.apple.mpegurl; charset=utf-8", "no-store");
}
