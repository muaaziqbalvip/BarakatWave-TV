import {
  getRequestBaseUrl,
  handleOptions,
  parseQuery,
  sendText
} from "../_lib/origin.js";
import { getChannels, getPlaylistById } from "../_lib/rtdb.js";
import { BRAND } from "../../data/catalog.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const q = parseQuery(req);
  const baseUrl = getRequestBaseUrl(req);
  const rawId = String(q.id || "free").replace(/\.m3u8?$/i, "").trim();

  const allChannels = await getChannels();

  // Built-in public/master exports: /playlist/free.m3u8 or /playlist/master.m3u8
  if (rawId === "free" || rawId === "master" || rawId === "all") {
    const list = rawId === "free" ? allChannels.filter((c) => c.tier === "free") : allChannels;
    const lines = [
      `#EXTM3U x-tvg-url="${baseUrl}/xmltv.php"`,
      `#PLAYLIST:BarakatWave TV (${rawId.toUpperCase()}) - Mizanora Projects by Muaaz Iqbal`
    ];
    for (const ch of list) {
      lines.push(
        `#EXTINF:-1 tvg-id="${ch.epgId}" tvg-logo="${ch.logo || BRAND.logoPrimary}" group-title="${ch.category}",${ch.name}`
      );
      lines.push(`${baseUrl}/ch/${ch.slug}.m3u8`);
    }
    res.setHeader("Content-Disposition", `inline; filename="barakatwave-${rawId}.m3u8"`);
    return sendText(res, 200, lines.join("\n") + "\n", "audio/x-mpegurl; charset=utf-8");
  }

  // Personal User Cloud Playlist (/playlist/<playlistId>.m3u8)
  const pl = await getPlaylistById(rawId);
  if (!pl) {
    return sendText(
      res,
      404,
      `#EXTM3U\n#EXTINF:-1,Playlist Not Found - Create yours at ${BRAND.siteUrl}\n${baseUrl}/media/welcome/index.m3u8\n`,
      "audio/x-mpegurl; charset=utf-8"
    );
  }

  const selectedIds = new Set(Array.isArray(pl.channelIds) ? pl.channelIds : []);
  const customStreams = Array.isArray(pl.customStreams) ? pl.customStreams : [];
  const chosenCatalog = allChannels.filter(
    (ch) => selectedIds.has(ch.id) || selectedIds.has(String(ch.streamId)) || selectedIds.has(ch.slug)
  );

  const xtUser = pl.xtreamUsername || "";
  const xtPass = pl.xtreamPassword || "";

  const lines = [
    `#EXTM3U x-tvg-url="${baseUrl}/xmltv.php"`,
    `#PLAYLIST:${(pl.name || "My BarakatWave Playlist").replace(/\r|\n/g, " ")} - BarakatWave TV`
  ];

  for (const ch of chosenCatalog) {
    lines.push(
      `#EXTINF:-1 tvg-id="${ch.epgId}" tvg-logo="${ch.logo || BRAND.logoPrimary}" group-title="${ch.category}",${ch.name}`
    );
    if (xtUser && xtPass) {
      lines.push(
        `${baseUrl}/live/${encodeURIComponent(xtUser)}/${encodeURIComponent(xtPass)}/${ch.streamId}.m3u8`
      );
    } else {
      lines.push(`${baseUrl}/ch/${ch.slug}.m3u8`);
    }
  }

  for (const custom of customStreams) {
    if (!custom || !custom.url) continue;
    const cName = String(custom.name || "Custom Live Channel").replace(/[\r\n"]/g, " ");
    const cGroup = String(custom.category || "My Custom Channels").replace(/[\r\n"]/g, " ");
    const cLogo = String(custom.logo || BRAND.logoPrimary).replace(/[\r\n"]/g, "");
    lines.push(`#EXTINF:-1 tvg-logo="${cLogo}" group-title="${cGroup}",${cName}`);
    lines.push(String(custom.url).trim());
  }

  res.setHeader("Content-Disposition", `inline; filename="${rawId}.m3u8"`);
  return sendText(res, 200, lines.join("\n") + "\n", "audio/x-mpegurl; charset=utf-8");
}
