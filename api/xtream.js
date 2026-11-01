import { parseQuery } from "./_lib/origin.js";
import playerHandler from "./_handlers/xtream-player.js";
import getHandler from "./_handlers/xtream-get.js";
import xmltvHandler from "./_handlers/xtream-xmltv.js";
import magPortalHandler from "./_handlers/mag-portal.js";

/**
 * BarakatWave TV — IPTV protocol router
 *   ep=player  -> Xtream Codes player_api.php
 *   ep=get     -> Xtream Codes get.php (M3U Plus)
 *   ep=xmltv   -> Xtream Codes xmltv.php (EPG)
 *   ep=portal  -> MAG / Stalker portal for MAC-based boxes
 */
export default async function handler(req, res) {
  const q = parseQuery(req);
  const ep = String(q.ep || "player").toLowerCase();
  if (ep === "get") return getHandler(req, res);
  if (ep === "xmltv") return xmltvHandler(req, res);
  if (ep === "portal" || ep === "mag") return magPortalHandler(req, res);
  return playerHandler(req, res);
}
