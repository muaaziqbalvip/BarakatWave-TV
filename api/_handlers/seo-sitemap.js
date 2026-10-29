import { getCanonicalBaseUrl, handleOptions, sendText } from "../_lib/origin.js";
import { getBlogs, getChannels } from "../_lib/rtdb.js";
import { BRAND } from "../../data/catalog.js";

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const siteUrl = getCanonicalBaseUrl();
  const today = new Date().toISOString().slice(0, 10);
  const [blogs, channels] = await Promise.all([getBlogs(), getChannels()]);

  const staticPages = [
    { path: "/", priority: "1.0", changefreq: "hourly" },
    { path: "/?view=cinema", priority: "0.95", changefreq: "daily" },
    { path: "/?view=xtream", priority: "0.95", changefreq: "daily" },
    { path: "/?view=playlist", priority: "0.9", changefreq: "daily" },
    { path: "/?view=pro", priority: "0.9", changefreq: "weekly" },
    { path: "/blog", priority: "0.95", changefreq: "daily" },
    { path: "/llms.txt", priority: "0.85", changefreq: "weekly" },
    { path: "/llms-full.txt", priority: "0.85", changefreq: "weekly" },
    { path: "/rss.xml", priority: "0.8", changefreq: "daily" }
  ];

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`
  ];

  for (const page of staticPages) {
    xml.push(
      `  <url>`,
      `    <loc>${esc(siteUrl + page.path)}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `    <changefreq>${page.changefreq}</changefreq>`,
      `    <priority>${page.priority}</priority>`,
      `    <image:image>`,
      `      <image:loc>${esc(BRAND.logoPrimary)}</image:loc>`,
      `      <image:title>${esc(`${BRAND.name} — ${BRAND.parentProject} by ${BRAND.founder}`)}</image:title>`,
      `    </image:image>`,
      `  </url>`
    );
  }

  for (const blog of blogs) {
    const mod = blog.publishedAt ? String(blog.publishedAt).slice(0, 10) : today;
    xml.push(
      `  <url>`,
      `    <loc>${esc(`${siteUrl}/blog/${blog.slug}`)}</loc>`,
      `    <lastmod>${mod}</lastmod>`,
      `    <changefreq>weekly</changefreq>`,
      `    <priority>0.9</priority>`,
      `  </url>`
    );
  }

  for (const ch of channels) {
    xml.push(
      `  <url>`,
      `    <loc>${esc(`${siteUrl}/?channel=${encodeURIComponent(ch.slug)}`)}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `    <changefreq>daily</changefreq>`,
      `    <priority>0.75</priority>`,
      `  </url>`
    );
  }

  xml.push(`</urlset>`);
  return sendText(res, 200, xml.join("\n") + "\n", "application/xml; charset=utf-8", "public, max-age=600");
}
