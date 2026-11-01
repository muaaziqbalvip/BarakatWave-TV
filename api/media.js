import { parseQuery } from "./_lib/origin.js";
import liveHandler from "./_handlers/live.js";
import streamHandler from "./_handlers/stream.js";
import proxyHandler from "./_handlers/proxy.js";
import playlistHandler from "./_handlers/playlist.js";

export default async function handler(req, res) {
  const q = parseQuery(req);
  const ep = String(q.ep || "live").toLowerCase();
  if (ep === "stream") return streamHandler(req, res);
  if (ep === "proxy") return proxyHandler(req, res);
  if (ep === "playlist") return playlistHandler(req, res);
  return liveHandler(req, res);
}
