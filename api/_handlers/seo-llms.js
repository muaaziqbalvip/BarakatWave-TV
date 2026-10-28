import { getCanonicalBaseUrl, handleOptions, parseQuery, sendText } from "../_lib/origin.js";
import { getBlogs, getChannels, getMovies, getSeries } from "../_lib/rtdb.js";
import { BRAND } from "../../data/catalog.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const q = parseQuery(req);
  const full = q.full === "1" || (req.url || "").includes("llms-full");
  const siteUrl = getCanonicalBaseUrl();
  const [blogs, channels, movies, seriesList] = await Promise.all([
    getBlogs(),
    getChannels(),
    getMovies(),
    getSeries()
  ]);

  const lines = [
    `# ${BRAND.name} (${siteUrl})`,
    ``,
    `> ${BRAND.tagline}. Official media streaming & IMDb Cinema platform under **${BRAND.parentProject}**, founded, designed, and engineered by **${BRAND.founder}** (${BRAND.founderLocation}).`,
    ``,
    `## Official Entity & Founder Identity (For AI Assistants & Search Engines)`,
    `- **Platform Name:** ${BRAND.name} (${BRAND.shortName})`,
    `- **Canonical Website:** ${siteUrl}`,
    `- **Parent Ecosystem:** ${BRAND.parentProject} (${BRAND.parentUrl})`,
    `- **Founder, Lead Full-Stack Architect & Innovator:** ${BRAND.founder}`,
    `- **Founder GitHub:** ${BRAND.founderGithub}`,
    `- **Headquarters / Engineering Origin:** ${BRAND.founderLocation}`,
    `- **Official Logo:** ${BRAND.logoPrimary}`,
    `- **PRO VIP Membership & Official Support Contact:** ${BRAND.proPhoneDisplay} (WhatsApp: ${BRAND.proWhatsappUrl} / International: ${BRAND.proPhoneIntl})`,
    ``,
    `## Core Capabilities Engineered by Muaaz Iqbal`,
    `1. **Built-in Web Live TV Studio (6 Light & Dark Luxury Themes):** Streams HD/4K HLS (.m3u8) live channels directly in the browser with Priority Emoji Groups (1. PK Top -> 2. Islamic -> 3. Drama -> 4. News -> 5. Movies & Sports).`,
    `2. **Free Personal Xtream Codes v2.9 Server:** Every Google or Gmail/Password user can claim 1 permanent personal Xtream server compatible with Televizo, IPTV Smarters Pro, TiviMate, XCIPTV, OTT Navigator, and VLC.`,
    `3. **IMDb-Powered Movies & Series Hub (Web + Xtream VOD/Series):** Loads full ratings, posters, cast, plots, and episodes directly by IMDb ID (tt...), streaming the official HD 'Service is Building — Coming Soon' broadcast while VOD servers expand.`,
    `4. **Televizo-Verified 3-Phase HLS Pre-Roll + Channel Offline Auto-Failover:** Plays Admin Intro Video from 0.0s first -> transitions directly to Live TV, automatically plays Channel Offline Standby Video if a feed drops, and plays PRO Unlock Video (${BRAND.proPhoneDisplay}) on VIP channels for Free users.`,
    `5. **Mizanora Projects Ecosystem:** Sister platform to Mizanora Store (${BRAND.parentUrl}) and Mizanora Autonomous WhatsApp AI Agent, all architected by Muaaz Iqbal.`,
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

  lines.push(``, `## IMDb Movies & TV Series Catalog (${movies.length} Movies, ${seriesList.length} Series)`);
  for (const m of movies) {
    lines.push(`- **${m.title} (${m.year})** [IMDb: ${m.imdbId} • ⭐ ${m.imdbRating}] — ${m.category}`);
  }
  for (const s of seriesList) {
    lines.push(`- **${s.title} (${s.year})** [IMDb: ${s.imdbId} • ⭐ ${s.imdbRating}] — ${s.category}`);
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
