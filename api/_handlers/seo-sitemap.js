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
    { path: "/", priority: "1.0", changefreq: "daily" },
    { path: "/blog", priority: "0.95", changefreq: "daily" },
    { path: "/llms.txt", priority: "0.8", changefreq: "weekly" },
    { path: "/llms-full.txt", priority: "0.8", changefreq: "weekly" },
    { path: "/rss.xml", priority: "0.7", changefreq: "daily" },
    { path: "/pricing", priority: "0.98", changefreq: "weekly" },
    { path: "/reseller", priority: "0.92", changefreq: "weekly" },
    { path: "/legal", priority: "0.6", changefreq: "monthly" },
    { path: "/legal/terms", priority: "0.6", changefreq: "monthly" },
    { path: "/legal/privacy", priority: "0.6", changefreq: "monthly" },
    { path: "/legal/license", priority: "0.58", changefreq: "monthly" },
    { path: "/legal/refund", priority: "0.58", changefreq: "monthly" },
    { path: "/legal/reseller-agreement", priority: "0.58", changefreq: "monthly" },
    { path: "/legal/dmca", priority: "0.55", changefreq: "monthly" },
    {
      path: "/legal/founder",
      priority: "0.85",
      changefreq: "monthly",
      images: [
        { loc: siteUrl + "/assets/img/founder/muaaz-iqbal-official.jpg", title: "Muaaz Iqbal — Founder of BarakatWave TV and Mizanora Projects" },
        { loc: siteUrl + "/assets/img/founder/muaaz-iqbal-portrait.jpg", title: "Muaaz Iqbal, full-stack developer and IPTV architect in Kasur, Pakistan" },
        { loc: siteUrl + "/assets/img/founder/muaaz-iqbal-mizanora-banner.jpg", title: "Muaaz Iqbal — Web & App Developer, Video Editor, Graphic Designer (Mizanora Projects)" },
        { loc: siteUrl + "/assets/img/founder/muaaz-iqbal-kasur-minar.jpg", title: "Muaaz Iqbal at Minar-e-Pakistan, Lahore — founder story" }
      ]
    },
    {
      path: "/pricing",
      priority: "0.98",
      changefreq: "weekly",
      images: [
        { loc: siteUrl + "/assets/img/brand/barakatwave-logo.png", title: "BarakatWave TV IPTV packages Pakistan" }
      ]
    },
    {
      path: "/reseller",
      priority: "0.92",
      changefreq: "weekly",
      images: [
        { loc: siteUrl + "/assets/img/founder/muaaz-iqbal-official.jpg", title: "BarakatWave IPTV reseller panel by Muaaz Iqbal" }
      ]
    }
  ];

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`
  ];

  for (const page of staticPages) {
    const images =
      Array.isArray(page.images) && page.images.length
        ? page.images
        : [{ loc: BRAND.logoPrimary, title: `${BRAND.name} — ${BRAND.parentProject} by ${BRAND.founder}` }];
    xml.push(
      `  <url>`,
      `    <loc>${esc(siteUrl + page.path)}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `    <changefreq>${page.changefreq}</changefreq>`,
      `    <priority>${page.priority}</priority>`,
      ...images.map(
        (img) =>
          `    <image:image>\n` +
          `      <image:loc>${esc(img.loc)}</image:loc>\n` +
          `      <image:title>${esc(img.title)}</image:title>\n` +
          `    </image:image>`
      ),
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
