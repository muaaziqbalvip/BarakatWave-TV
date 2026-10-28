import {
  getRequestBaseUrl,
  handleOptions,
  parseBody,
  parseQuery,
  sendJson
} from "../_lib/origin.js";
import {
  getCategoriesFromChannels,
  getChannels,
  verifyXtreamCredentials
} from "../_lib/rtdb.js";
import { BRAND } from "../../data/catalog.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const query = parseQuery(req);
  const body = req.method === "POST" ? await parseBody(req) : {};
  const params = { ...query, ...body };

  const username = String(params.username || "").trim();
  const password = String(params.password || "").trim();
  const action = String(params.action || "").trim().toLowerCase();

  const baseUrl = getRequestBaseUrl(req);
  const parsedBase = new URL(baseUrl);
  const nowSec = Math.floor(Date.now() / 1000);
  const timeNow = new Date().toISOString().replace("T", " ").slice(0, 19);

  const serverInfo = {
    url: parsedBase.hostname,
    port: parsedBase.protocol === "http:" ? parsedBase.port || "80" : "80",
    https_port: parsedBase.protocol === "https:" ? parsedBase.port || "443" : "443",
    server_protocol: parsedBase.protocol.replace(":", ""),
    rtmp_port: "8880",
    timezone: "Asia/Karachi",
    timestamp_now: nowSec,
    time_now: timeNow,
    process: true
  };

  const acct = await verifyXtreamCredentials(username, password);
  if (!acct) {
    return sendJson(res, 200, {
      user_info: {
        auth: 0,
        status: "Disabled",
        message: `Invalid Xtream credentials. Claim your FREE server at ${BRAND.siteUrl} or contact PRO support: ${BRAND.proPhoneDisplay}`
      },
      server_info: serverInfo
    });
  }

  const createdSec = acct.createdAt
    ? Math.floor(new Date(acct.createdAt).getTime() / 1000) || nowSec - 86400
    : nowSec - 86400;
  const expSec = acct.expDate ? String(acct.expDate) : String(nowSec + 365 * 86400 * 5);

  const userInfo = {
    username: acct.username,
    password: acct.password,
    message:
      acct.effectivePlan === "pro"
        ? `BarakatWave TV PRO VIP Active — Mizanora Projects by Muaaz Iqbal`
        : `BarakatWave TV FREE Server Active — Upgrade PRO on WhatsApp ${BRAND.proPhoneDisplay}`,
    auth: 1,
    status: "Active",
    exp_date: expSec,
    is_trial: "0",
    active_cons: "0",
    created_at: String(createdSec),
    max_connections: String(acct.maxConnections || (acct.effectivePlan === "pro" ? 5 : 1)),
    allowed_output_formats: ["m3u8", "ts", "rtmp"]
  };

  if (!action) {
    return sendJson(res, 200, { user_info: userInfo, server_info: serverInfo });
  }

  const channels = await getChannels();

  if (action === "get_live_categories") {
    const categories = await getCategoriesFromChannels(channels);
    return sendJson(res, 200, categories);
  }

  if (action === "get_live_streams") {
    const filterCat = params.category_id ? String(params.category_id) : "";
    const filtered = filterCat
      ? channels.filter((c) => String(c.categoryId) === filterCat)
      : channels;

    const streams = filtered.map((ch, idx) => {
      const isLockedForUser = ch.tier === "pro" && acct.effectivePlan !== "pro";
      const displayName =
        ch.tier === "pro"
          ? isLockedForUser
            ? `🔒 ${ch.name.replace(/\s*\[PRO.*?\]/i, "")} [PRO - Unlock: 0306-2015326]`
            : `👑 ${ch.name}`
          : ch.name;

      return {
        num: idx + 1,
        name: displayName,
        stream_type: "live",
        stream_id: Number(ch.streamId),
        stream_icon: ch.logo || BRAND.logoPrimary,
        epg_channel_id: ch.epgId || `${ch.slug}.bw`,
        added: String(createdSec),
        is_adult: "0",
        category_id: String(ch.categoryId || "1"),
        category_ids: [Number(ch.categoryId || 1)],
        custom_sid: "",
        tv_archive: 0,
        direct_source: "",
        tv_archive_duration: 0
      };
    });
    return sendJson(res, 200, streams);
  }

  if (
    action === "get_vod_categories" ||
    action === "get_vod_streams" ||
    action === "get_series_categories" ||
    action === "get_series"
  ) {
    return sendJson(res, 200, []);
  }

  if (action === "get_short_epg" || action === "get_simple_data_table") {
    const streamId = Number(params.stream_id || 0);
    const ch = channels.find((c) => Number(c.streamId) === streamId);
    const title = ch
      ? ch.tier === "pro" && acct.effectivePlan !== "pro"
        ? `PRO VIP Channel — Contact WhatsApp 0306-2015326 to Unlock`
        : ch.nowPlaying || `Live on ${ch.name}`
      : "BarakatWave Live Broadcast";
    const startTs = nowSec - (nowSec % 3600);
    const endTs = startTs + 7200;
    return sendJson(res, 200, {
      epg_listings: [
        {
          id: String(streamId || 1),
          epg_id: ch ? ch.epgId : "bw.live",
          title: Buffer.from(title, "utf8").toString("base64"),
          lang: "en",
          start: new Date(startTs * 1000).toISOString().replace("T", " ").slice(0, 19),
          end: new Date(endTs * 1000).toISOString().replace("T", " ").slice(0, 19),
          description: Buffer.from(
            `BarakatWave Live TV — A Mizanora Project by Muaaz Iqbal (${BRAND.siteUrl}). Pro VIP Support: 0306-2015326`,
            "utf8"
          ).toString("base64"),
          channel_id: ch ? ch.epgId : "bw.live",
          start_timestamp: String(startTs),
          stop_timestamp: String(endTs)
        }
      ]
    });
  }

  return sendJson(res, 200, { user_info: userInfo, server_info: serverInfo });
}
