/**
 * BarakatWave M3U / M3U8 Parser, Auto-Classifier & Playlist Generator
 * Supports #EXTINF, tvg-id, tvg-name, tvg-logo, group-title, #EXTGRP, #EXTVLCOPT
 * Automatically classifies & sorts channels into Priority Emoji Xtream Groups!
 */

import {
  resolveCategoryMeta,
  autoSortAndReindexChannels
} from "./catalog-browser.js";

export function parseM3uPlaylist(rawText, defaultTier = "free", { autoSort = true } = {}) {
  const lines = String(rawText || "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  const channels = [];
  let currentMeta = null;
  let currentHeaders = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      const commaIdx = line.lastIndexOf(",");
      const attrPart = commaIdx >= 0 ? line.slice(0, commaIdx) : line;
      const displayTitle = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : "Live Channel";

      const getAttr = (name) => {
        const rx = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i");
        const m = attrPart.match(rx);
        return m ? m[1].trim() : "";
      };

      const name = (getAttr("tvg-name") || displayTitle || `Channel ${channels.length + 1}`).trim();
      const logo = getAttr("tvg-logo");
      const group = getAttr("group-title") || "";
      const epgId = getAttr("tvg-id");
      const country = getAttr("tvg-country") || (/pakistan|urdu|ptv|geo|ary|hum|samaa|dunya/i.test(`${name} ${group}`) ? "PK" : "INT");
      const language = getAttr("tvg-language") || (country === "PK" ? "Urdu" : "Multi");

      currentMeta = { name, logo, category: group, epgId, country, language };
      continue;
    }

    if (line.startsWith("#EXTGRP:")) {
      if (currentMeta) {
        currentMeta.category = line.slice(8).trim() || currentMeta.category;
      }
      continue;
    }

    if (line.startsWith("#EXTVLCOPT:")) {
      const opt = line.slice(11).trim();
      if (/^http-user-agent=/i.test(opt)) {
        currentHeaders["User-Agent"] = opt.split("=").slice(1).join("=").trim();
      } else if (/^http-referrer=/i.test(opt) || /^http-referer=/i.test(opt)) {
        currentHeaders.Referer = opt.split("=").slice(1).join("=").trim();
      }
      continue;
    }

    if (line.startsWith("#")) continue;

    // Stream URL line
    if (/^(https?:\/\/|\/)/i.test(line)) {
      const meta = currentMeta || {
        name: guessNameFromUrl(line, channels.length + 1),
        logo: "",
        category: "",
        epgId: "",
        country: "PK",
        language: "Urdu / English"
      };
      const catMeta = resolveCategoryMeta(meta.category, meta.name, meta.country, true);
      const slug = slugify(meta.name) || `ch-${channels.length + 1}`;
      const inferredTier =
        /\[pro|vip\]/i.test(meta.name) ? "pro" : defaultTier === "pro" ? "pro" : "free";

      channels.push({
        id: `ch_${slug}_${Math.random().toString(36).slice(2, 6)}`,
        streamId: 3000 + channels.length + 1,
        slug,
        name: meta.name,
        logo: meta.logo || "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
        category: catMeta.name,
        categoryId: catMeta.id,
        country: meta.country || "PK",
        language: meta.language || "Urdu / English",
        epgId: meta.epgId || `${slug}.bw`,
        tier: inferredTier,
        status: "active",
        url: line,
        backupUrls: [],
        headers: { ...currentHeaders },
        order: channels.length + 1
      });
      currentMeta = null;
      currentHeaders = {};
    }
  }

  return autoSort ? autoSortAndReindexChannels(channels, { reclassify: false }) : channels;
}

export function exportChannelsToM3u(channels, { baseUrl = "", useCleanLinks = false, title = "BarakatWave Live TV" } = {}) {
  const origin = (baseUrl || (typeof window !== "undefined" ? window.location.origin : "https://barakatwave.vercel.app")).replace(/\/+$/, "");
  const out = [
    `#EXTM3U x-tvg-url="${origin}/xmltv.php" url-tvg="${origin}/xmltv.php"`,
    `#PLAYLIST:${title} — A Mizanora Project by Muaaz Iqbal`
  ];
  for (const ch of channels) {
    const catMeta = resolveCategoryMeta(ch.category, ch.name, ch.country, false);
    const groupTitle = (catMeta.xtreamTitle || catMeta.name || ch.category || "📺 LIVE TV").replace(/"/g, "'");
    const safeName = String(ch.name || "Channel").replace(/"/g, "'");
    const safeLogo = String(ch.logo || "").replace(/"/g, "");
    const safeEpg = String(ch.epgId || `${ch.slug}.bw`).replace(/"/g, "");
    out.push(
      `#EXTINF:-1 tvg-id="${safeEpg}" tvg-name="${safeName}" tvg-logo="${safeLogo}" group-title="${groupTitle}",${ch.name}`
    );
    if (ch.headers && ch.headers["User-Agent"]) {
      out.push(`#EXTVLCOPT:http-user-agent=${ch.headers["User-Agent"]}`);
    }
    if (ch.headers && ch.headers.Referer) {
      out.push(`#EXTVLCOPT:http-referrer=${ch.headers.Referer}`);
    }
    if (useCleanLinks) {
      out.push(`${origin}/ch/${ch.slug}.m3u8`);
    } else {
      out.push(ch.url.startsWith("/") ? `${origin}${ch.url}` : ch.url);
    }
  }
  return out.join("\n") + "\n";
}

export function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function guessNameFromUrl(url, index) {
  try {
    const u = new URL(url, "http://localhost");
    const segs = u.pathname.split("/").filter(Boolean);
    const base = (segs[segs.length - 1] || "").replace(/\.(m3u8|ts|m2ts|mp4)$/i, "");
    if (base && base !== "index" && base !== "master" && base !== "playlist") {
      return base.replace(/[-_]+/g, " ").toUpperCase();
    }
    if (segs.length >= 2) {
      return segs[segs.length - 2].replace(/[-_]+/g, " ").toUpperCase();
    }
  } catch {
    // ignore
  }
  return `Live Channel ${index}`;
}
