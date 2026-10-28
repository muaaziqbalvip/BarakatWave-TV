import { handleOptions, sendText } from "../_lib/origin.js";
import { getChannels } from "../_lib/rtdb.js";
import { BRAND } from "../../data/catalog.js";

function xmlEscape(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatXmltvDate(date) {
  const iso = date.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${iso} +0000`;
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  const channels = await getChannels();
  const now = new Date();
  const baseHour = new Date(Math.floor(now.getTime() / 3600000) * 3600000);

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<tv generator-info-name="BarakatWave Live TV - Mizanora Projects by Muaaz Iqbal" generator-info-url="${BRAND.siteUrl}">`
  ];

  for (const ch of channels) {
    const id = xmlEscape(ch.epgId || `${ch.slug}.bw`);
    xml.push(`  <channel id="${id}">`);
    xml.push(`    <display-name>${xmlEscape(ch.name)}</display-name>`);
    if (ch.logo) xml.push(`    <icon src="${xmlEscape(ch.logo)}" />`);
    xml.push(`  </channel>`);
  }

  for (const ch of channels) {
    const id = xmlEscape(ch.epgId || `${ch.slug}.bw`);
    for (let slot = -1; slot < 6; slot++) {
      const start = new Date(baseHour.getTime() + slot * 2 * 3600000);
      const stop = new Date(start.getTime() + 2 * 3600000);
      const progTitle =
        ch.tier === "pro"
          ? `${ch.nowPlaying || ch.name} (PRO VIP • Contact 0306-2015326)`
          : ch.nowPlaying || `Live Broadcast — ${ch.name}`;
      xml.push(
        `  <programme start="${formatXmltvDate(start)}" stop="${formatXmltvDate(stop)}" channel="${id}">`,
        `    <title lang="en">${xmlEscape(progTitle)}</title>`,
        `    <desc lang="en">${xmlEscape(
          `Streaming on BarakatWave Live TV (${BRAND.siteUrl}) — A Mizanora Project by Muaaz Iqbal. For PRO VIP access message WhatsApp 0306-2015326.`
        )}</desc>`,
        `    <category lang="en">${xmlEscape(ch.category || "Live TV")}</category>`,
        `  </programme>`
      );
    }
  }

  xml.push(`</tv>`);
  return sendText(res, 200, xml.join("\n") + "\n", "application/xml; charset=utf-8", "public, max-age=300");
}
