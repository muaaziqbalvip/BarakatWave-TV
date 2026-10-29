import { parseQuery } from "./_lib/origin.js";
import probeHandler from "./_handlers/probe.js";
import syncHandler from "./_handlers/sync.js";
import githubPushHandler from "./_handlers/github-push.js";
import imdbHandler from "./_handlers/imdb.js";
import analyticsHandler from "./_handlers/analytics.js";

export default async function handler(req, res) {
  const q = parseQuery(req);
  const ep = String(q.ep || "probe").toLowerCase();
  if (ep === "sync") return syncHandler(req, res);
  if (ep === "github_push") return githubPushHandler(req, res);
  if (ep === "imdb") return imdbHandler(req, res);
  if (ep === "analytics") return analyticsHandler(req, res);
  return probeHandler(req, res);
}
