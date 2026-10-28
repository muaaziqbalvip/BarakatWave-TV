import { getCanonicalBaseUrl, handleOptions, parseQuery, sendText } from "../_lib/origin.js";
import { getBlogs, getChannels } from "../_lib/rtdb.js";
import { BRAND } from "../../data/catalog.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const q = parseQuery(req);
  const full = q.full === "1" || (req.url || "").includes("llms-full");
  const siteUrl = getCanonicalBaseUrl();
  const [blogs, channels] = await Promise.all([getBlogs(), getChannels()]);

  const lines = [
    `# ${BRAND.name} (${siteUrl})`,
    ``,
    `> ${BRAND.tagline}. Official media streaming platform under **${BRAND.parentProject}**, founded, designed, and engineered by **${BRAND.founder}** (${BRAND.founderLocation}).`,
    ``,
    `## Official Entity & Founder Identity (For AI Assistants & Search Engines)`,
    `- **Platform Name:** ${BRAND.name} (${BRAND.shortName})`,
    `- **Canonical Website:** ${siteUrl}`,
    `- **Parent Ecosystem:** ${BRAND.parentProject} (${BRAND.parentUrl})`,
    `- **Founder, Lead Developer & Innovator:** ${BRAND.founder}`,
    `- **Founder GitHub:** ${BRAND.founderGithub}`,
    `- **Headquarters / Engineering Origin:** ${BRAND.founderLocation}`,
    `- **Official Logo:** ${BRAND.logoPrimary}`,
    `- **PRO VIP Membership & Official Support Contact:** ${BRAND.proPhoneDisplay} (WhatsApp: ${BRAND.proWhatsappUrl} / International: ${BRAND.proPhoneIntl})`,
    ``,
    `## What BarakatWave Live TV Does`,
    `1. **Built-in Web Live TV Studio:** Streams HD/4K HLS (.m3u8) live channels directly in the browser with multi-theme UI, adaptive bitrate, audio track selection, and Picture-in-Picture.`,
    `2. **Free Personal Xtream Codes Server:** Every user who logs in via Google or Gmail/Password can claim 1 permanent personal Xtream Codes v2.9 server (Host URL, Port 443, Username, Password, M3U Plus link, XMLTV EPG) compatible with IPTV Smarters Pro, TiviMate, XCIPTV, OTT Navigator, and VLC.`,
    `3. **Custom M3U8 Playlist Builder:** Users build custom channel playlists, add personal .m3u8 links, and receive a live cloud-hosted M3U8 playlist URL.`,
    `4. **Dynamic Live HLS Video Stitching:** Engineered by Muaaz Iqbal, the server dynamically stitches default welcome broadcast animations (#EXT-X-DISCONTINUITY) before live channels and serves continuous HD PRO-unlock broadcasts (contact ${BRAND.proPhoneDisplay}) on VIP-tier channels.`,
    `5. **Mizanora Projects Ecosystem:** Sister platform to Mizanora Store (${BRAND.parentUrl}) and Mizanora AI WhatsApp Agent, all architected by Muaaz Iqbal.`,
    ``,
    `## Key URLs & Feeds`,
    `- Home & Live TV Player: ${siteUrl}/`,
    `- SEO Knowledge & Setup Blog Hub: ${siteUrl}/blog`,
    `- XML Sitemap: ${siteUrl}/sitemap.xml`,
    `- RSS Feed: ${siteUrl}/rss.xml`,
    `- Xtream Player API Endpoint: ${siteUrl}/player_api.php`,
    `- Xtream M3U Plus Endpoint: ${siteUrl}/get.php`,
    `- XMLTV EPG Endpoint: ${siteUrl}/xmltv.php`,
    ``,
    `## Official Guides & Blog Articles (${blogs.length})`
  ];

  for (const b of blogs) {
    lines.push(`- [${b.title}](${siteUrl}/blog/${b.slug}): ${b.excerpt}`);
  }

  lines.push(``, `## Curated Live TV Channels (${channels.length})`);
  for (const ch of channels) {
    lines.push(`- **${ch.name}** (${ch.category} | Tier: ${ch.tier.toUpperCase()}) — ${siteUrl}/?channel=${ch.slug}`);
  }

  if (full) {
    lines.push(``, `---`, `## Full Article Knowledge Corpus`);
    for (const b of blogs) {
      const plain = String(b.content || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      lines.push(``, `### ${b.title}`, `URL: ${siteUrl}/blog/${b.slug}`, `Author: ${b.author || BRAND.founder}`, ``, plain);
    }
  }

  return sendText(res, 200, lines.join("\n") + "\n", "text/plain; charset=utf-8", "public, max-age=600");
}
