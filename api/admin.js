import { parseQuery } from "./_lib/origin.js";
import probeHandler from "./_handlers/probe.js";
import syncHandler from "./_handlers/sync.js";
import githubPushHandler from "./_handlers/github-push.js";

export default async function handler(req, res) {
  const q = parseQuery(req);
  const ep = String(q.ep || "probe").toLowerCase();
  if (ep === "sync") return syncHandler(req, res);
  if (ep === "github_push") return githubPushHandler(req, res);
  return probeHandler(req, res);
}
