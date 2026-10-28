import {
  getCanonicalBaseUrl,
  handleOptions,
  parseBody,
  parseQuery,
  sendJson,
  sendText
} from "../_lib/origin.js";
import { getBlogs, getSettings } from "../_lib/rtdb.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const q = parseQuery(req);
  const settings = await getSettings();
  const indexNowKey =
    process.env.INDEXNOW_KEY || settings.indexNowKey || "barakatwave2026mizanoraseokey";

  // Serve IndexNow key verification text file when ?verify=1
  if (q.verify === "1") {
    return sendText(res, 200, indexNowKey, "text/plain; charset=utf-8", "public, max-age=3600");
  }

  const siteUrl = getCanonicalBaseUrl();
  const host = new URL(siteUrl).hostname;
  const blogs = await getBlogs();

  const body = req.method === "POST" ? await parseBody(req) : {};
  const urlList =
    Array.isArray(body.urls) && body.urls.length
      ? body.urls
      : [
          `${siteUrl}/`,
          `${siteUrl}/blog`,
          `${siteUrl}/sitemap.xml`,
          ...blogs.map((b) => `${siteUrl}/blog/${b.slug}`)
        ];

  if (req.method !== "POST") {
    return sendJson(res, 200, {
      ok: true,
      siteUrl,
      sitemapUrl: `${siteUrl}/sitemap.xml`,
      rssUrl: `${siteUrl}/rss.xml`,
      llmsUrl: `${siteUrl}/llms.txt`,
      indexNowKeyLocation: `${siteUrl}/${indexNowKey}.txt`,
      indexedCandidateCount: urlList.length,
      urls: urlList
    });
  }

  // Ping IndexNow API (Bing, Yandex, DuckDuckGo, ChatGPT Search, Copilot)
  const payload = {
    host,
    key: indexNowKey,
    keyLocation: `${siteUrl}/${indexNowKey}.txt`,
    urlList
  };

  let indexNowStatus = 0;
  let note = "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const pingRes = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload)
    });
    clearTimeout(timer);
    indexNowStatus = pingRes.status;
    note =
      pingRes.ok || pingRes.status === 202
        ? "Successfully submitted all URLs to IndexNow (Bing, Copilot, ChatGPT Search, DuckDuckGo, Yandex)!"
        : `IndexNow responded HTTP ${pingRes.status}`;
  } catch {
    note =
      "Prepared IndexNow & Sitemap payload. Once live on barakatwave.vercel.app, clicking Ping submits directly to global search engines.";
  }

  return sendJson(res, 200, {
    ok: true,
    submittedCount: urlList.length,
    indexNowStatus,
    sitemapUrl: `${siteUrl}/sitemap.xml`,
    rssUrl: `${siteUrl}/rss.xml`,
    note,
    urls: urlList
  });
}
