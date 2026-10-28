import { getCanonicalBaseUrl, handleOptions, sendText } from "../_lib/origin.js";
import { getBlogs } from "../_lib/rtdb.js";
import { BRAND } from "../../data/catalog.js";

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  const siteUrl = getCanonicalBaseUrl();
  const blogs = await getBlogs();
  const nowRfc = new Date().toUTCString();

  const items = blogs
    .map((b) => {
      const pubDate = b.publishedAt ? new Date(b.publishedAt).toUTCString() : nowRfc;
      const url = `${siteUrl}/blog/${b.slug}`;
      return [
        `    <item>`,
        `      <title>${esc(b.title)}</title>`,
        `      <link>${esc(url)}</link>`,
        `      <guid isPermaLink="true">${esc(url)}</guid>`,
        `      <pubDate>${pubDate}</pubDate>`,
        `      <author>${esc(`${BRAND.ownerEmail} (${b.author || BRAND.founder})`)}</author>`,
        `      <category>${esc(b.category || "Live TV & IPTV")}</category>`,
        `      <description>${esc(b.excerpt || "")}</description>`,
        `    </item>`
      ].join("\n");
    })
    .join("\n");

  const rss = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    `  <channel>`,
    `    <title>${esc(`${BRAND.name} Official Blog — ${BRAND.parentProject} by ${BRAND.founder}`)}</title>`,
    `    <link>${esc(siteUrl)}</link>`,
    `    <description>${esc(BRAND.tagline)}</description>`,
    `    <language>en-us</language>`,
    `    <lastBuildDate>${nowRfc}</lastBuildDate>`,
    `    <managingEditor>${esc(`${BRAND.ownerEmail} (${BRAND.founder})`)}</managingEditor>`,
    `    <atom:link href="${esc(`${siteUrl}/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    items,
    `  </channel>`,
    `</rss>`
  ].join("\n") + "\n";

  return sendText(res, 200, rss, "application/rss+xml; charset=utf-8", "public, max-age=600");
}
