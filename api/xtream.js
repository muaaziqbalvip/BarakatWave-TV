import { parseQuery } from "./_lib/origin.js";
import playerHandler from "./_handlers/xtream-player.js";
import getHandler from "./_handlers/xtream-get.js";
import xmltvHandler from "./_handlers/xtream-xmltv.js";

export default async function handler(req, res) {
  const q = parseQuery(req);
  const ep = String(q.ep || "player").toLowerCase();
  if (ep === "get") return getHandler(req, res);
  if (ep === "xmltv") return xmltvHandler(req, res);
  return playerHandler(req, res);
}
