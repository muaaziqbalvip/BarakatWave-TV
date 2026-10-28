import {
  getRequestBaseUrl,
  handleOptions,
  parseQuery,
  sendText
} from "../_lib/origin.js";
import { checkRateLimit } from "../_lib/security.js";
import { getChannels, getMovies, getSeries, verifyXtreamCredentials } from "../_lib/rtdb.js";
import { BRAND } from "../../data/catalog.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const q = parseQuery(req);
  const username = String(q.username || "").trim();
  const password = String(q.password || "").trim();
  const baseUrl = getRequestBaseUrl(req);

  const acct = await verifyXtreamCredentials(username, password);
  if (!acct) {
    const rl = checkRateLimit(req, "xtream_get_fail", 25, 60_000);
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfterSec));
      return sendText(res, 429, "#EXTM3U\n#EXTINF:-1,Too Many Attempts\n", "audio/x-mpegurl; charset=utf-8", "no-store", req);
    }
    return sendText(
      res,
      401,
      `#EXTM3U\n#EXTINF:-1,Invalid Xtream Login - Visit ${BRAND.siteUrl}\n${baseUrl}/media/pro-unlock/index.m3u8\n`,
      "audio/x-mpegurl; charset=utf-8",
      "no-store",
      req
    );
  }

  const [channels, movies, seriesList] = await Promise.all([
    getChannels(),
    getMovies(),
    getSeries()
  ]);
  const epgUrl = `${baseUrl}/xmltv.php?username=${encodeURIComponent(acct.username)}&password=${encodeURIComponent(acct.password)}`;

  const lines = [`#EXTM3U x-tvg-url="${epgUrl}" url-tvg="${epgUrl}"`];
  lines.push(`#PLAYLIST:BarakatWave TV (${acct.effectivePlan.toUpperCase()}) - Mizanora Projects by Muaaz Iqbal`);

  for (const ch of channels) {
    const isLocked = ch.tier === "pro" && acct.effectivePlan !== "pro";
    const cleanBaseName = ch.name.replace(/\s*\[PRO.*?\]/i, "").trim();
    const catIcon = ch.categoryIcon || "📺";
    const pinPrefix = ch.pinned ? "📌 " : "";
    const displayTitle =
      ch.tier === "pro"
        ? isLocked
          ? `🔒 👑 ${cleanBaseName} [PRO VIP • 0306-2015326]`
          : `👑 ${catIcon} ${cleanBaseName} [PRO VIP]`
        : `${pinPrefix}🟢 ${catIcon} ${cleanBaseName}`;
    const safeName = displayTitle.replace(/"/g, "'");
    const safeGroup = (ch.xtreamGroup || ch.category || "🇵🇰 ⭐ PAKISTAN TOP CHANNELS").replace(/"/g, "'");
    const safeLogo = (ch.logo || BRAND.logoPrimary).replace(/"/g, "");
    const safeEpg = (ch.epgId || `${ch.slug}.bw`).replace(/"/g, "");

    lines.push(
      `#EXTINF:-1 tvg-id="${safeEpg}" tvg-name="${safeName}" tvg-logo="${safeLogo}" group-title="${safeGroup}",${displayTitle}`
    );
    lines.push(
      `${baseUrl}/live/${encodeURIComponent(acct.username)}/${encodeURIComponent(acct.password)}/${ch.streamId}.m3u8`
    );
  }

  // Append IMDb VOD Movies & Series into M3U Plus playlist as well
  for (const m of movies) {
    const title = `🎬 ${m.title} (${m.year}) ⭐ ${m.imdbRating} [${m.streamUrl ? "HD" : "Coming Soon"}]`.replace(/"/g, "'");
    const grp = (m.category || "🎬 🍿 IMDb MOVIES").replace(/"/g, "'");
    const logo = (m.poster || BRAND.logoPrimary).replace(/"/g, "");
    lines.push(`#EXTINF:-1 tvg-id="${m.imdbId}" tvg-name="${title}" tvg-logo="${logo}" group-title="${grp}",${title}`);
    lines.push(
      `${baseUrl}/movie/${encodeURIComponent(acct.username)}/${encodeURIComponent(acct.password)}/${m.streamId}.mp4`
    );
  }

  for (const s of seriesList) {
    const firstEp = (s.episodes && s.episodes[0]) || { id: `${s.seriesId}0101`, title: `${s.title} S01E01` };
    const title = `📺 ${s.title} ⭐ ${s.imdbRating} — S01E01 [${firstEp.streamUrl || s.streamUrl ? "HD" : "Coming Soon"}]`.replace(/"/g, "'");
    const grp = (s.category || "📺 ⭐ IMDb SERIES").replace(/"/g, "'");
    const logo = (s.poster || BRAND.logoPrimary).replace(/"/g, "");
    lines.push(`#EXTINF:-1 tvg-id="${s.imdbId}" tvg-name="${title}" tvg-logo="${logo}" group-title="${grp}",${title}`);
    lines.push(
      `${baseUrl}/series/${encodeURIComponent(acct.username)}/${encodeURIComponent(acct.password)}/${firstEp.id}.mp4`
    );
  }

  res.setHeader(
    "Content-Disposition",
    `inline; filename="barakatwave-${acct.username}.m3u8"`
  );
  return sendText(res, 200, lines.join("\n") + "\n", "audio/x-mpegurl; charset=utf-8", "private, max-age=30", req);
}
