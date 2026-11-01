import { parseQuery } from "./_lib/origin.js";
import blogHandler from "./_handlers/blog.js";
import sitemapHandler from "./_handlers/seo-sitemap.js";
import rssHandler from "./_handlers/seo-rss.js";
import llmsHandler from "./_handlers/seo-llms.js";
import indexnowHandler from "./_handlers/seo-indexnow.js";
import legalHandler from "./_handlers/legal.js";
import pricingHandler from "./_handlers/pricing.js";

export default async function handler(req, res) {
  const q = parseQuery(req);
  const ep = String(q.ep || "blog").toLowerCase();
  if (ep === "sitemap") return sitemapHandler(req, res);
  if (ep === "rss") return rssHandler(req, res);
  if (ep === "llms") return llmsHandler(req, res);
  if (ep === "indexnow") return indexnowHandler(req, res);
  if (ep === "legal") return legalHandler(req, res);
  if (ep === "pricing") return pricingHandler(req, res);
  return blogHandler(req, res);
}
