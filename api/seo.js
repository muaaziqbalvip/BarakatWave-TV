import { parseQuery, sendText } from "./_lib/origin.js";
import { getSettings } from "./_lib/rtdb.js";
import blogHandler from "./_handlers/blog.js";
import sitemapHandler from "./_handlers/seo-sitemap.js";
import rssHandler from "./_handlers/seo-rss.js";
import llmsHandler from "./_handlers/seo-llms.js";
import indexnowHandler from "./_handlers/seo-indexnow.js";

export default async function handler(req, res) {
  const q = parseQuery(req);
  const ep = String(q.ep || "blog").toLowerCase();
  if (ep === "gsc_file") {
    const code = String(q.code || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const settings = await getSettings();
    const saved = String(settings.gscVerification || "").replace(/^google|\.html$/gi, "").trim();
    if (!code || (saved && saved !== code)) {
      return sendText(res, 404, "Not Found");
    }
    return sendText(
      res,
      200,
      `google-site-verification: google${code}.html`,
      "text/html; charset=utf-8",
      "public, max-age=300"
    );
  }
  if (ep === "sitemap") return sitemapHandler(req, res);
  if (ep === "rss") return rssHandler(req, res);
  if (ep === "llms") return llmsHandler(req, res);
  if (ep === "indexnow") return indexnowHandler(req, res);
  return blogHandler(req, res);
}
