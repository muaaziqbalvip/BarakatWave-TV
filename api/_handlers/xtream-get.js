import {
  getRequestBaseUrl,
  handleOptions,
  parseQuery,
  sendText
} from "../_lib/origin.js";
import { getChannels, verifyXtreamCredentials } from "../_lib/rtdb.js";
import { BRAND } from "../../data/catalog.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const q = parseQuery(req);
  const username = String(q.username || "").trim();
  const password = String(q.password || "").trim();
  const baseUrl = getRequestBaseUrl(req);

  const acct = await verifyXtreamCredentials(username, password);
  if (!acct) {
    return sendText(
      res,
      401,
      `#EXTM3U\n#EXTINF:-1,Invalid Xtream Login - Visit ${BRAND.siteUrl}\n${baseUrl}/media/pro-unlock/index.m3u8\n`,
      "audio/x-mpegurl; charset=utf-8"
    );
  }

  const channels = await getChannels();
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

  res.setHeader(
    "Content-Disposition",
    `inline; filename="barakatwave-${acct.username}.m3u8"`
  );
  return sendText(res, 200, lines.join("\n") + "\n", "audio/x-mpegurl; charset=utf-8");
}
