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
  getMovies,
  getSeries,
  getVodCategoriesList,
  getSeriesCategoriesList,
  verifyXtreamCredentials
} from "../_lib/rtdb.js";
import { BRAND } from "../../data/catalog.js";
import { checkRateLimit } from "../_lib/security.js";

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
    const rl = checkRateLimit(req, "xtream_bad_auth", 30, 60_000);
    if (!rl.allowed) {
      return sendJson(res, 429, {
        user_info: { auth: 0, status: "Disabled", message: "Too many failed login attempts. Try again in 1 minute." },
        server_info: serverInfo
      });
    }
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
    allowed_output_formats: ["m3u8", "ts"]
  };

  if (!action) {
    return sendJson(res, 200, { user_info: userInfo, server_info: serverInfo }, "private, max-age=15", req);
  }

  // ==================== LIVE TV CATEGORIES & STREAMS ====================
  if (action === "get_live_categories") {
    const channels = await getChannels();
    const categories = await getCategoriesFromChannels(channels);
    return sendJson(res, 200, categories, "private, max-age=30", req);
  }

  if (action === "get_live_streams") {
    const channels = await getChannels();
    await getCategoriesFromChannels(channels);
    const filterCat = params.category_id ? String(params.category_id) : "";
    const filtered = filterCat
      ? channels.filter((c) => String(c.categoryId) === filterCat)
      : channels;

    const streams = filtered.map((ch, idx) => {
      const isLockedForUser = ch.tier === "pro" && acct.effectivePlan !== "pro";
      const cleanBaseName = ch.name.replace(/\s*\[PRO.*?\]/i, "").trim();
      const catIcon = ch.categoryIcon || "📺";
      const pinPrefix = ch.pinned ? "📌 " : "";
      const displayName =
        ch.tier === "pro"
          ? isLockedForUser
            ? `🔒 👑 ${cleanBaseName} [PRO VIP • WhatsApp 0306-2015326]`
            : `👑 ${catIcon} ${cleanBaseName} [PRO VIP]`
          : `${pinPrefix}🟢 ${catIcon} ${cleanBaseName}`;

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
    return sendJson(res, 200, streams, "private, max-age=15", req);
  }

  // ==================== IMDb VOD MOVIES CATEGORIES, STREAMS & INFO ====================
  if (action === "get_vod_categories") {
    const movies = await getMovies();
    return sendJson(res, 200, getVodCategoriesList(movies), "private, max-age=30", req);
  }

  if (action === "get_vod_streams") {
    const movies = await getMovies();
    const filterCat = params.category_id ? String(params.category_id) : "";
    const filtered = filterCat
      ? movies.filter((m) => String(m.categoryId) === filterCat)
      : movies;

    const vodList = filtered.map((m, idx) => {
      const ratingNum = parseFloat(m.imdbRating) || 8.0;
      const ext = m.streamUrl && /\.m3u8($|\?)/i.test(m.streamUrl) ? "m3u8" : "mp4";
      const statusTag = m.streamUrl ? "HD" : "Coming Soon";
      const lockPrefix = m.tier === "pro" && acct.effectivePlan !== "pro" ? "🔒 👑 " : "🎬 ";
      return {
        num: idx + 1,
        name: `${lockPrefix}${m.title} (${m.year}) ⭐ ${ratingNum.toFixed(1)} [${statusTag}]`,
        stream_type: "movie",
        stream_id: Number(m.streamId),
        stream_icon: m.poster || BRAND.logoPrimary,
        rating: ratingNum.toFixed(1),
        rating_5based: Number((ratingNum / 2).toFixed(1)),
        added: String(createdSec),
        is_adult: "0",
        category_id: String(m.categoryId || "101"),
        category_ids: [Number(m.categoryId || 101)],
        container_extension: ext,
        custom_sid: m.imdbId || "",
        direct_source: "",
        imdb_id: m.imdbId || ""
      };
    });
    return sendJson(res, 200, vodList, "private, max-age=30", req);
  }

  if (action === "get_vod_info") {
    const vodId = String(params.vod_id || params.stream_id || "").trim();
    const movies = await getMovies();
    const m =
      movies.find((item) => String(item.streamId) === vodId || item.imdbId === vodId) ||
      movies[0];
    if (!m) return sendJson(res, 200, { info: {}, movie_data: {} }, "private, max-age=30", req);

    const ratingNum = parseFloat(m.imdbRating) || 8.0;
    const ext = m.streamUrl && /\.m3u8($|\?)/i.test(m.streamUrl) ? "m3u8" : "mp4";
    const durMin = parseInt(String(m.runtime || "130"), 10) || 130;
    const genreStr = Array.isArray(m.genres) ? m.genres.join(", ") : String(m.genres || "Cinema");
    const statusNote = m.streamUrl
      ? "Streaming in Full HD on BarakatWave Cinema."
      : "🚧 BarakatWave Cinema VOD Service is Building — Coming Soon! Press Play to preview official status.";

    return sendJson(res, 200, {
      info: {
        imdb_id: m.imdbId,
        tmdb_id: m.imdbId,
        name: `${m.title} (${m.year})`,
        o_name: m.title,
        cover_big: m.poster || BRAND.logoPrimary,
        movie_image: m.poster || BRAND.logoPrimary,
        releasedate: `${m.year}-01-01`,
        episode_run_time: String(durMin),
        youtube_trailer: "",
        director: m.director || "IMDb Official Selection",
        actors: m.cast || "",
        cast: m.cast || "",
        description: `${m.plot || ""}\n\n[IMDb: ${m.imdbId} • ⭐ ${ratingNum.toFixed(1)}/10] ${statusNote}`,
        plot: `${m.plot || ""} • [IMDb ${m.imdbId} ⭐ ${ratingNum.toFixed(1)}/10] ${statusNote}`,
        age: "Family / PG-13",
        mpaa_rating: "PG-13",
        rating_count_kinopoisk: 1000,
        country: m.country || "INT",
        genre: genreStr,
        backdrop_path: m.backdrop ? [m.backdrop] : [BRAND.logoPrimary],
        duration_secs: durMin * 60,
        duration: `${String(Math.floor(durMin / 60)).padStart(2, "0")}:${String(durMin % 60).padStart(2, "0")}:00`,
        video: {},
        audio: {},
        bitrate: 2500,
        rating: ratingNum.toFixed(1)
      },
      movie_data: {
        stream_id: Number(m.streamId),
        name: `${m.title} (${m.year}) ⭐ ${ratingNum.toFixed(1)}`,
        added: String(createdSec),
        category_id: String(m.categoryId || "101"),
        container_extension: ext,
        custom_sid: m.imdbId || "",
        direct_source: ""
      }
    }, "private, max-age=30", req);
  }

  // ==================== IMDb TV SERIES CATEGORIES, SERIES LIST & EPISODE INFO ====================
  if (action === "get_series_categories") {
    const seriesList = await getSeries();
    return sendJson(res, 200, getSeriesCategoriesList(seriesList), "private, max-age=30", req);
  }

  if (action === "get_series") {
    const seriesList = await getSeries();
    const filterCat = params.category_id ? String(params.category_id) : "";
    const filtered = filterCat
      ? seriesList.filter((s) => String(s.categoryId) === filterCat)
      : seriesList;

    const out = filtered.map((s, idx) => {
      const ratingNum = parseFloat(s.imdbRating) || 8.5;
      const genreStr = Array.isArray(s.genres) ? s.genres.join(", ") : String(s.genres || "Drama");
      const lockPrefix = s.tier === "pro" && acct.effectivePlan !== "pro" ? "🔒 👑 " : "📺 ";
      return {
        num: idx + 1,
        name: `${lockPrefix}${s.title} ⭐ ${ratingNum.toFixed(1)} [IMDb]`,
        series_id: Number(s.seriesId),
        cover: s.poster || BRAND.logoPrimary,
        plot: `${s.plot || ""} [IMDb: ${s.imdbId} • ⭐ ${ratingNum.toFixed(1)}/10 • Service Building — Coming Soon]`,
        cast: s.cast || "",
        director: s.director || "",
        genre: genreStr,
        releaseDate: String(s.year || "2024"),
        last_modified: String(nowSec),
        rating: ratingNum.toFixed(1),
        rating_5based: Number((ratingNum / 2).toFixed(1)),
        backdrop_path: s.backdrop ? [s.backdrop] : [BRAND.logoPrimary],
        youtube_trailer: "",
        episode_run_time: String(parseInt(String(s.runtime || "45"), 10) || 45),
        category_id: String(s.categoryId || "201"),
        category_ids: [Number(s.categoryId || 201)],
        imdb_id: s.imdbId || ""
      };
    });
    return sendJson(res, 200, out, "private, max-age=30", req);
  }

  if (action === "get_series_info") {
    const seriesId = String(params.series_id || "").trim();
    const seriesList = await getSeries();
    const s =
      seriesList.find((item) => String(item.seriesId) === seriesId || item.imdbId === seriesId) ||
      seriesList[0];
    if (!s) return sendJson(res, 200, { seasons: [], info: {}, episodes: {} }, "private, max-age=30", req);

    const ratingNum = parseFloat(s.imdbRating) || 8.5;
    const genreStr = Array.isArray(s.genres) ? s.genres.join(", ") : String(s.genres || "Drama");
    const episodesBySeason = {};
    const seasonsMap = new Map();

    for (const ep of s.episodes || []) {
      const sNum = String(Number(ep.season) || 1);
      if (!episodesBySeason[sNum]) episodesBySeason[sNum] = [];
      const epExt = (ep.streamUrl || s.streamUrl) && /\.m3u8($|\?)/i.test(ep.streamUrl || s.streamUrl) ? "m3u8" : "mp4";
      episodesBySeason[sNum].push({
        id: String(ep.id),
        episode_num: Number(ep.episode) || episodesBySeason[sNum].length + 1,
        title: `${ep.title} ${ep.streamUrl || s.streamUrl ? "[HD]" : "[Coming Soon]"}`,
        container_extension: epExt,
        info: {
          imdb_id: s.imdbId,
          movie_image: ep.thumbnail || s.backdrop || s.poster || BRAND.logoPrimary,
          plot: ep.plot || s.plot || "Service is building — Coming Soon on BarakatWave TV!",
          releasedate: String(s.year || "2024"),
          rating: ratingNum,
          duration_secs: 2700,
          duration: "00:45:00"
        },
        custom_sid: s.imdbId || "",
        added: String(createdSec),
        season: Number(sNum),
        direct_source: ""
      });
      seasonsMap.set(Number(sNum), {
        air_date: `${String(s.year || "2024").slice(0, 4)}-01-01`,
        episode_count: episodesBySeason[sNum].length,
        id: Number(sNum),
        name: `Season ${sNum}`,
        overview: `${s.title} — Season ${sNum} (IMDb ${s.imdbId})`,
        season_number: Number(sNum),
        cover: s.poster || BRAND.logoPrimary,
        cover_big: s.poster || BRAND.logoPrimary
      });
    }

    return sendJson(res, 200, {
      seasons: [...seasonsMap.values()],
      info: {
        name: `${s.title} ⭐ ${ratingNum.toFixed(1)}`,
        cover: s.poster || BRAND.logoPrimary,
        plot: `${s.plot || ""} [IMDb: ${s.imdbId} • ⭐ ${ratingNum.toFixed(1)}/10]`,
        cast: s.cast || "",
        director: s.director || "",
        genre: genreStr,
        releaseDate: String(s.year || "2024"),
        last_modified: String(nowSec),
        rating: ratingNum.toFixed(1),
        rating_5based: Number((ratingNum / 2).toFixed(1)),
        backdrop_path: s.backdrop ? [s.backdrop] : [BRAND.logoPrimary],
        youtube_trailer: "",
        episode_run_time: String(parseInt(String(s.runtime || "45"), 10) || 45),
        category_id: String(s.categoryId || "201"),
        imdb_id: s.imdbId
      },
      episodes: episodesBySeason
    }, "private, max-age=30", req);
  }

  // ==================== EPG ====================
  if (action === "get_short_epg" || action === "get_simple_data_table") {
    const channels = await getChannels();
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
    }, "private, max-age=60", req);
  }

  return sendJson(res, 200, { user_info: userInfo, server_info: serverInfo }, "private, max-age=15", req);
}
