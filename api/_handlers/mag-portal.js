import {
  getRequestBaseUrl,
  handleOptions,
  parseQuery,
  sendJson
} from "../_lib/origin.js";
import { checkRateLimit } from "../_lib/security.js";
import { getChannels, getXtreamAccount, rtdbGet } from "../_lib/rtdb.js";
import { normalizeMac, signPlayRequest, verifyPlayToken } from "../_lib/licenses.js";
import { BRAND } from "../../data/catalog.js";

/**
 * BarakatWave TV — MAG / Stalker Portal (MAC-based IPTV)
 * ------------------------------------------------------
 * Lets Infomir MAG boxes, Stalker portals and Enigma2 devices subscribe with a
 * hardware MAC address instead of a username + password.
 *
 * Routes (see vercel.json):
 *   /portal.php            -> /api/xtream?ep=portal
 *   /server/load.php       -> /api/xtream?ep=portal
 *   /stalker_portal/server/load.php -> /api/xtream?ep=portal
 *
 * Supported actions: handshake, get_profile, get_account_info, get_genres,
 * get_ordered_list, get_all_channels, do_auth.
 *
 * A MAC is authorised when it is bound to a panel client / Xtream account
 * (`mac` field) or when it equals BW_MAG_DEMO_MAC (free preview tier).
 */

const DEMO_MAC = "00:1A:79:00:00:01";
const TOKEN_TTL_SEC = 60 * 60 * 8;

function clientMac(req, q) {
  const raw =
    q.mac ||
    req.headers["x-mac"] ||
    req.headers["cookie"]?.match(/mac=([^;]+)/)?.[1] ||
    req.headers["x-forwarded-for-mac"] ||
    "";
  return normalizeMac(raw) || DEMO_MAC;
}

function issueToken(mac) {
  return signPlayRequest({ username: mac, kind: "mag", target: "portal", ttlSec: TOKEN_TTL_SEC }).token;
}

function checkToken(mac, token) {
  if (!token) return true; // handshake-less STBs re-auth constantly; MAC binding is the real gate
  const res = verifyPlayToken(token);
  return res.valid && res.payload.k === "mag" && res.payload.u === mac;
}

async function findMacAccount(mac) {
  if (!mac) return null;
  const [clients, xtream] = await Promise.all([
    rtdbGet("panel/clients", { ttlMs: 5000 }).catch(() => null),
    rtdbGet("xtreamAccounts", { ttlMs: 5000 }).catch(() => null)
  ]);

  const matchMac = (obj) => normalizeMac(obj?.mac || "") === mac;
  const fromClients = clients && typeof clients === "object"
    ? Object.values(clients).find(matchMac)
    : null;
  if (fromClients) return { ...fromClients, source: "panel" };

  const fromXtream = xtream && typeof xtream === "object" ? Object.values(xtream).find(matchMac) : null;
  if (fromXtream) return { ...fromXtream, source: "xtream" };

  if (mac === DEMO_MAC) {
    return {
      username: "mag_demo",
      displayName: "MAG Demo Box",
      plan: "free",
      status: "Active",
      expDate: 0,
      mac,
      source: "demo"
    };
  }
  return null;
}

function isActive(account) {
  if (!account) return false;
  if (String(account.status || "Active").toLowerCase() === "suspended") return false;
  if (String(account.status || "").toLowerCase() === "expired") return false;
  const exp = Number(account.expDate || 0);
  if (exp > 0 && Date.now() / 1000 > exp) return false;
  return true;
}

function genreIdFor(category, index, map) {
  if (!map.has(category)) map.set(category, 100 + map.size + index);
  return map.get(category);
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const rl = checkRateLimit(req, "mag_portal", 240, 60_000);
  if (!rl.allowed) {
    return sendJson(res, 429, { error: "Too many portal requests" });
  }

  const q = parseQuery(req);
  const action = String(q.action || q.type || "handshake").toLowerCase();
  const mac = clientMac(req, q);
  const base = getRequestBaseUrl(req);
  const account = await findMacAccount(mac);

  if (!account) {
    return sendJson(res, 200, {
      js: {
        block_msg: `MAC ${mac} is not registered. Send this MAC on WhatsApp ${BRAND.proPhoneDisplay} to activate BarakatWave TV, or use the demo MAC ${DEMO_MAC}.`,
        status: "MAC_NOT_REGISTERED"
      }
    });
  }

  const active = isActive(account);
  const plan = String(account.plan || account.tier || "free").toLowerCase() === "pro" ? "pro" : "free";
  const expDate = Number(account.expDate || 0);

  if (action === "handshake" || action === "do_auth") {
    if (!active) {
      return sendJson(res, 200, {
        js: { token: "", status: "EXPIRED", block_msg: `Subscription expired. Renew on WhatsApp ${BRAND.proPhoneDisplay}.` }
      });
    }
    res.setHeader("Set-Cookie", `mac=${encodeURIComponent(mac)}; Path=/; Max-Age=2592000; SameSite=Lax`);
    return sendJson(res, 200, {
      js: { token: issueToken(mac), random: Math.random().toString(36).slice(2, 10), not_valid: 0 }
    });
  }

  if (!checkToken(mac, q.token)) {
    return sendJson(res, 200, { js: { status: "INVALID_TOKEN", block_msg: "Session token invalid or expired." } });
  }

  if (action === "get_profile") {
    return sendJson(res, 200, {
      js: {
        id: mac,
        name: account.displayName || account.username || "BarakatWave Box",
        mac,
        status: active ? 1 : 0,
        blocked: active ? "0" : "1",
        phone: BRAND.proPhoneDisplay,
        end_date: expDate ? new Date(expDate * 1000).toISOString().slice(0, 19).replace("T", " ") : "",
        tarif_plan_name: plan.toUpperCase(),
        tv_genres: [],
        storages: {},
        settings: { show_sidebar: 1 },
        expire_billing_date: expDate ? new Date(expDate * 1000).toISOString() : ""
      }
    });
  }

  if (action === "get_account_info") {
    return sendJson(res, 200, {
      js: {
        mac,
        login: mac,
        status: active ? 1 : 0,
        tarif_plan_name: plan.toUpperCase(),
        end_date: expDate ? new Date(expDate * 1000).toISOString().slice(0, 10) : "unlimited",
        fname: account.displayName || "BarakatWave",
        phone: BRAND.proPhoneDisplay
      }
    });
  }

  const channels = await getChannels();
  const visible = channels.filter((ch) => !(ch.tier === "pro" && plan !== "pro"));

  if (action === "get_genres") {
    const map = new Map();
    const genres = [];
    visible.forEach((ch, i) => {
      const id = genreIdFor(ch.category, i, map);
      if (!genres.some((g) => g.id === String(id))) {
        genres.push({ id: String(id), title: ch.category, alias: ch.category, censored: 0 });
      }
    });
    return sendJson(res, 200, { js: [{ id: "0", title: "All channels", alias: "all", censored: 0 }, ...genres] });
  }

  if (action === "get_ordered_list" || action === "get_all_channels" || action === "get_short_epg") {
    const map = new Map();
    visible.forEach((ch, i) => genreIdFor(ch.category, i, map));
    const genreFilter = String(q.genre || "0");
    const list = visible.filter((ch) => genreFilter === "0" || String(genreIdFor(ch.category, 0, map)) === genreFilter);

    const page = Math.max(1, Number(q.p) || 1);
    const perPage = Math.min(200, Math.max(10, Number(q.max_page_items) || 60));
    const slice = q.action === "get_all_channels" ? list : list.slice((page - 1) * perPage, page * perPage);

    return sendJson(res, 200, {
      js: {
        total_items: list.length,
        max_page_items: perPage,
        cur_page: page,
        data: slice.map((ch, i) => ({
          id: String(ch.streamId || i + 1),
          name: ch.name,
          number: String(ch.streamId || i + 1),
          cmd: `ffmpeg ${base}/live/${encodeURIComponent(account.username || "demo")}/mag/${ch.streamId}.m3u8`,
          tv_genre_id: String(genreIdFor(ch.category, 0, map)),
          logo: ch.logo || BRAND.logoPrimary,
          censored: 1,
          status: 1,
          hd: /4k|uhd/i.test(ch.name) ? 4 : /hd/i.test(ch.name) ? 1 : 0
        }))
      }
    });
  }

  return sendJson(res, 200, {
    js: {
      status: "OK",
      brand: BRAND.name,
      founder: BRAND.founder,
      support: BRAND.proPhoneDisplay,
      mac,
      plan,
      note: "Supported actions: handshake, get_profile, get_account_info, get_genres, get_ordered_list, get_all_channels"
    }
  });
}
