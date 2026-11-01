import fs from "node:fs";
import {
  DEFAULT_CHANNELS,
  DEFAULT_SETTINGS,
  DEFAULT_BLOGS,
  DEFAULT_REVIEWS,
  CATEGORIES,
  resolveCategoryMeta,
  decorateGroupTitle,
  getCategoryPriority
} from "../../data/catalog.js";
import {
  VOD_CATEGORIES,
  SERIES_CATEGORIES,
  DEFAULT_MOVIES,
  DEFAULT_SERIES,
  inferVodCategory,
  inferSeriesCategory,
  metahubPoster,
  metahubBackdrop
} from "../../data/imdb-seed.js";
import { getAutoHarvestedImdb } from "./cinemeta-auto.js";

const DEFAULT_RTDB_URL = (
  process.env.FIREBASE_DATABASE_URL ||
  "https://barakatwave-tv-default-rtdb.firebaseio.com"
).replace(/\/+$/, "");

const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_API_KEY || "AIzaSyB1aWw27UEteaspMte4wTp_nUWEf07FqwQ";

const LOCAL_MIRROR_FILE = "/tmp/barakatwave-rtdb-mirror.json";
const memCache = new Map();
let cachedAnonToken = { token: "", expiresAt: 0, failedAt: 0 };
let mergedCatalogCache = { movies: null, moviesAt: 0, series: null, seriesAt: 0 };

function readLocalMirror() {
  try {
    if (fs.existsSync(LOCAL_MIRROR_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_MIRROR_FILE, "utf8"));
    }
  } catch {
    // ignore corrupt mirror
  }
  return {};
}

function writeLocalMirror(mutator) {
  try {
    const current = readLocalMirror();
    const updated = mutator(current) || current;
    fs.writeFileSync(LOCAL_MIRROR_FILE, JSON.stringify(updated, null, 2), "utf8");
    memCache.clear();
    mergedCatalogCache = { movies: null, moviesAt: 0, series: null, seriesAt: 0 };
    return updated;
  } catch {
    return {};
  }
}

export function updateLocalMirrorNode(nodePath, value) {
  const parts = nodePath.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  return writeLocalMirror((root) => {
    if (parts.length === 0) return value || {};
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
      cur = cur[k];
    }
    const last = parts[parts.length - 1];
    if (value === null || value === undefined) {
      delete cur[last];
    } else {
      cur[last] = value;
    }
    return root;
  });
}

function getFromLocalMirror(nodePath) {
  const root = readLocalMirror();
  const parts = nodePath.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  let cur = root;
  for (const p of parts) {
    if (!cur || typeof cur !== "object" || !(p in cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Fallback helper: if Firebase RTDB rules are temporarily set to "auth != null"
 * instead of public .read on channels/settings/xtreamAccounts/$user, try obtaining
 * a short-lived Firebase Auth REST token so IPTV players still read live RTDB data.
 */
async function getFallbackAuthToken() {
  const now = Date.now();
  if (cachedAnonToken.token && now < cachedAnonToken.expiresAt) {
    return cachedAnonToken.token;
  }
  if (cachedAnonToken.failedAt && now - cachedAnonToken.failedAt < 60000) {
    return "";
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2200);
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnSecureToken: true })
      }
    );
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data && data.idToken) {
        cachedAnonToken = {
          token: data.idToken,
          expiresAt: now + 50 * 60 * 1000,
          failedAt: 0
        };
        return data.idToken;
      }
    }
  } catch {
    // ignore network/sandbox restrictions
  }
  cachedAnonToken.failedAt = now;
  return "";
}

export async function rtdbGet(nodePath, { ttlMs = 6000, authToken = "" } = {}) {
  const clean = nodePath.replace(/^\/+|\/+$/g, "");
  const cacheKey = `${clean}:${authToken ? "auth" : "pub"}`;
  const now = Date.now();
  if (ttlMs > 0 && memCache.has(cacheKey)) {
    const hit = memCache.get(cacheKey);
    if (now - hit.ts < ttlMs) return hit.val;
  }

  const secret = authToken || process.env.FIREBASE_DATABASE_SECRET || "";
  const qs = secret ? `?auth=${encodeURIComponent(secret)}` : "";
  const url = `${DEFAULT_RTDB_URL}/${clean}.json${qs}`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3200);
    let res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    clearTimeout(timer);

    // If RTDB returned 401 because rules require auth != null, retry with Firebase Auth token
    if (res.status === 401 && !secret) {
      const fbToken = await getFallbackAuthToken();
      if (fbToken) {
        const ctrl2 = new AbortController();
        const timer2 = setTimeout(() => ctrl2.abort(), 2800);
        res = await fetch(`${DEFAULT_RTDB_URL}/${clean}.json?auth=${encodeURIComponent(fbToken)}`, {
          signal: ctrl2.signal,
          headers: { Accept: "application/json" }
        });
        clearTimeout(timer2);
      }
    }

    if (res.ok) {
      const json = await res.json();
      if (json !== null && json !== undefined) {
        memCache.set(cacheKey, { ts: now, val: json });
        return json;
      }
    }
  } catch {
    // Offline/sandbox fallback to local mirror + seed defaults
  }

  const mirrored = getFromLocalMirror(clean);
  if (mirrored !== undefined) return mirrored;
  return null;
}

export async function rtdbSet(nodePath, value, { authToken = "", method = "PUT" } = {}) {
  const clean = nodePath.replace(/^\/+|\/+$/g, "");
  updateLocalMirrorNode(clean, value);
  const secret = authToken || process.env.FIREBASE_DATABASE_SECRET || "";
  const qs = secret ? `?auth=${encodeURIComponent(secret)}` : "";
  const url = `${DEFAULT_RTDB_URL}/${clean}.json${qs}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value)
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export async function getSettings() {
  const remote = await rtdbGet("settings/defaults", { ttlMs: 5000 });
  return { ...DEFAULT_SETTINGS, ...(remote && typeof remote === "object" ? remote : {}) };
}

export async function getChannels({ includeInactive = false } = {}) {
  const remote = await rtdbGet("channels", { ttlMs: 5000 });
  let list = [];
  if (remote && typeof remote === "object") {
    list = Array.isArray(remote)
      ? remote.filter(Boolean)
      : Object.entries(remote).map(([key, val]) => ({ id: key, ...val }));
  }
  if (!list.length) {
    list = DEFAULT_CHANNELS.map((c) => ({ ...c }));
  }
  list = list.map((ch, idx) => normalizeChannel(ch, idx));
  if (!includeInactive) {
    list = list.filter((ch) => ch.status !== "inactive" && ch.status !== "disabled");
  }
  list.sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    const oa = typeof a.order === "number" ? a.order : 9999;
    const ob = typeof b.order === "number" ? b.order : 9999;
    if (oa !== ob) return oa - ob;
    const pa = getCategoryPriority(a.category, a.categoryId);
    const pb = getCategoryPriority(b.category, b.categoryId);
    if (pa !== pb) return pa - pb;
    return a.streamId - b.streamId;
  });
  return list;
}

export function normalizeChannel(ch, idx = 0) {
  const slug =
    ch.slug ||
    String(ch.name || `channel-${idx + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") ||
    `channel-${idx + 1}`;
  const streamId = Number(ch.streamId) || 1001 + idx;
  const catMeta = resolveCategoryMeta(ch.category, ch.name, ch.country, false);
  const categoryId = String(catMeta.id || ch.categoryId || "1");
  const tier = String(ch.tier || "free").toLowerCase() === "pro" ? "pro" : "free";
  return {
    id: ch.id || `ch_${streamId}`,
    streamId,
    slug,
    name: ch.name || `Channel ${streamId}`,
    category: catMeta.name,
    xtreamGroup: catMeta.xtreamTitle || decorateGroupTitle(catMeta.name).toUpperCase(),
    categoryIcon: catMeta.icon || "📺",
    categoryId,
    country: ch.country || "PK",
    language: ch.language || "Urdu / English",
    tier,
    pinned: Boolean(ch.pinned),
    featured: Boolean(ch.featured),
    status: ch.status || "active",
    logo: ch.logo || "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
    epgId: ch.epgId || `${slug}.barakatwave.tv`,
    nowPlaying: ch.nowPlaying || `Live Broadcast on ${ch.name || "BarakatWave TV"}`,
    url: ch.url || "/media/demo-live/index.m3u8",
    backupUrls: Array.isArray(ch.backupUrls) ? ch.backupUrls.filter(Boolean) : [],
    introVideoUrl: ch.introVideoUrl || "",
    offlineVideoUrl: ch.offlineVideoUrl || "",
    proUnlockVideoUrl: ch.proUnlockVideoUrl || "",
    streamFormat: String(ch.streamFormat || "auto").toLowerCase(),
    drmScheme: String(ch.drmScheme || "").toLowerCase(),
    drmKey: String(ch.drmKey || "").trim(),
    drmLicenseUrl: String(ch.drmLicenseUrl || "").trim(),
    useProxy: Boolean(ch.useProxy),
    headers: ch.headers && typeof ch.headers === "object" ? ch.headers : {},
    order: typeof ch.order === "number" ? ch.order : idx + 1
  };
}

export async function getCategoriesFromChannels(channels) {
  const map = new Map();
  for (const base of CATEGORIES) {
    map.set(String(base.id), {
      category_id: String(base.id),
      category_name: base.xtreamTitle || base.name,
      parent_id: 0,
      _priority: base.priority
    });
  }

  let nextCustomId = 20;
  for (const ch of channels || []) {
    const cid = String(ch.categoryId || "");
    if (cid && cid !== "99" && map.has(cid)) continue;

    const customTitle = decorateGroupTitle(ch.xtreamGroup || ch.category || "Live TV");
    const existing = [...map.values()].find(
      (v) => v.category_name.toLowerCase() === customTitle.toLowerCase()
    );
    if (existing) {
      ch.categoryId = existing.category_id;
    } else {
      const idStr = cid && cid !== "99" ? cid : String(nextCustomId++);
      ch.categoryId = idStr;
      map.set(idStr, {
        category_id: idStr,
        category_name: customTitle,
        parent_id: 0,
        _priority: 20 + Number(idStr)
      });
    }
  }

  return [...map.values()]
    .sort((a, b) => (a._priority ?? 99) - (b._priority ?? 99))
    .map(({ _priority, ...clean }) => clean);
}

export async function getXtreamAccount(username) {
  if (!username) return null;
  const cleanUser = String(username).trim().replace(/[.#$[\]/]/g, "");
  if (!cleanUser) return null;

  // Built-in test accounts so VLC / IPTV Smarters / TiviMate can be verified immediately
  if (cleanUser === "demo" || cleanUser === "bw_demo") {
    return {
      username: cleanUser,
      password: cleanUser === "demo" ? "demo" : "Barakat123",
      uid: "demo_uid",
      displayName: "BarakatWave Demo Viewer",
      plan: "free",
      status: "Active",
      maxConnections: 2,
      createdAt: "2026-10-28T00:00:00Z",
      expDate: null
    };
  }

  const acct = await rtdbGet(`xtreamAccounts/${cleanUser}`, { ttlMs: 3000 });
  if (acct && typeof acct === "object" && acct.username) {
    return acct;
  }
  return null;
}

export async function verifyXtreamCredentials(username, password) {
  const acct = await getXtreamAccount(username);
  if (!acct) return null;
  if (String(acct.password) !== String(password)) return null;
  if (String(acct.status || "Active").toLowerCase() === "suspended") return null;

  let effectivePlan = String(acct.plan || "free").toLowerCase() === "pro" ? "pro" : "free";
  if (effectivePlan === "pro" && acct.expDate) {
    const expSec = Number(acct.expDate);
    if (expSec > 0 && Date.now() / 1000 > expSec) {
      effectivePlan = "free";
    }
  }
  return { ...acct, effectivePlan };
}

export async function getPlaylistById(playlistId) {
  if (!playlistId) return null;
  const cleanId = String(playlistId).replace(/\.m3u8?$/i, "").replace(/[.#$[\]/]/g, "");
  const pl = await rtdbGet(`playlists/${cleanId}`, { ttlMs: 4000 });
  return pl && typeof pl === "object" ? pl : null;
}

export async function getBlogs() {
  const remote = await rtdbGet("blogs", { ttlMs: 15000 });
  const bySlug = new Map();
  for (const b of DEFAULT_BLOGS) {
    bySlug.set(b.slug, { ...b });
  }
  if (remote && typeof remote === "object") {
    for (const [k, val] of Object.entries(remote)) {
      if (val && typeof val === "object" && val.title) {
        const slug = val.slug || k;
        bySlug.set(slug, { ...bySlug.get(slug), ...val, slug });
      }
    }
  }
  return [...bySlug.values()].sort(
    (a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
  );
}

export async function getReviews() {
  const remote = await rtdbGet("reviews", { ttlMs: 10000 });
  if (remote && typeof remote === "object") {
    const arr = Object.entries(remote)
      .map(([id, r]) => ({ id, ...r }))
      .filter((r) => r && r.comment);
    if (arr.length) {
      return arr.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }
  }
  return DEFAULT_REVIEWS;
}

export async function getMovies() {
  const now = Date.now();
  if (mergedCatalogCache.movies && now - mergedCatalogCache.moviesAt < 15_000) {
    return mergedCatalogCache.movies;
  }

  const remote = await rtdbGet("movies", { ttlMs: 12_000 });
  const harvested = getAutoHarvestedImdb().movies || [];

  // Merge order: Admin Custom RTDB Titles (top) + Built-in 2000–2026 IMDb Catalog (1,134+) + Live Cinemeta 2000–2026 Auto-Harvest
  const byImdb = new Map();
  for (const m of DEFAULT_MOVIES) {
    byImdb.set(m.imdbId.toLowerCase(), { ...m });
  }
  for (const hm of harvested) {
    const k = String(hm.imdbId || "").toLowerCase();
    if (k && !byImdb.has(k)) byImdb.set(k, { ...hm });
  }

  if (remote && typeof remote === "object") {
    const remList = Array.isArray(remote)
      ? remote.filter(Boolean)
      : Object.entries(remote).map(([id, m]) => ({ id, ...m }));
    for (const rm of remList) {
      const k = String(rm.imdbId || rm.id || "").toLowerCase();
      if (!k) continue;
      if (rm._deleted) {
        byImdb.delete(k);
        continue;
      }
      const prev = byImdb.get(k);
      if (prev) {
        // Preserve freshly updated 2000–2026 category metadata while applying Admin streamUrl/tier/title overrides
        byImdb.set(k, {
          ...prev,
          ...rm,
          category: rm.customCategory ? rm.category : prev.category,
          categoryId: rm.customCategory ? rm.categoryId : prev.categoryId,
          streamUrl: String(rm.streamUrl ?? prev.streamUrl ?? "").trim(),
          tier: rm.tier || prev.tier || "free"
        });
      } else {
        byImdb.set(k, { ...rm, _adminCustom: true });
      }
    }
  }

  let nextAutoStreamId = 6500;
  const usedStreamIds = new Set();
  const normalized = [];
  let idx = 0;

  for (const m of byImdb.values()) {
    const imdbId = String(m.imdbId || `tt000${5001 + idx}`).trim().toLowerCase();
    let sid = Number(m.streamId) || 5001 + idx;
    while (usedStreamIds.has(sid)) sid = nextAutoStreamId++;
    usedStreamIds.add(sid);

    const cat =
      VOD_CATEGORIES.find((c) => c.id === String(m.categoryId) || c.name === m.category) ||
      inferVodCategory(m);

    normalized.push({
      ...m,
      id: m.id || `mov_${imdbId}`,
      streamId: sid,
      imdbId,
      title: m.title || `IMDb Movie (${imdbId})`,
      year: String(m.year || "2024"),
      imdbRating: String(m.imdbRating || "7.8"),
      runtime: String(m.runtime || "125 min"),
      genres: Array.isArray(m.genres)
        ? m.genres
        : String(m.genres || "Drama")
            .split(",")
            .map((s) => s.trim()),
      category: cat.name,
      categoryId: String(cat.id),
      poster: m.poster || metahubPoster(imdbId),
      backdrop: m.backdrop || metahubBackdrop(imdbId),
      tier: String(m.tier || "free").toLowerCase() === "pro" ? "pro" : "free",
      streamUrl: String(m.streamUrl || "").trim(),
      order: m._adminCustom ? -1000 + idx : idx + 1
    });
    idx++;
  }

  normalized.sort((a, b) => (a.order ?? 99999) - (b.order ?? 99999));
  mergedCatalogCache.movies = normalized;
  mergedCatalogCache.moviesAt = now;
  return normalized;
}

export async function getSeries() {
  const now = Date.now();
  if (mergedCatalogCache.series && now - mergedCatalogCache.seriesAt < 15_000) {
    return mergedCatalogCache.series;
  }

  const remote = await rtdbGet("series", { ttlMs: 12_000 });
  const harvested = getAutoHarvestedImdb().series || [];

  const byImdb = new Map();
  for (const s of DEFAULT_SERIES) {
    byImdb.set(s.imdbId.toLowerCase(), { ...s });
  }
  for (const hs of harvested) {
    const k = String(hs.imdbId || "").toLowerCase();
    if (k && !byImdb.has(k)) byImdb.set(k, { ...hs });
  }

  if (remote && typeof remote === "object") {
    const remList = Array.isArray(remote)
      ? remote.filter(Boolean)
      : Object.entries(remote).map(([id, s]) => ({ id, ...s }));
    for (const rs of remList) {
      const k = String(rs.imdbId || rs.id || "").toLowerCase();
      if (!k) continue;
      if (rs._deleted) {
        byImdb.delete(k);
        continue;
      }
      const prev = byImdb.get(k);
      if (prev) {
        byImdb.set(k, {
          ...prev,
          ...rs,
          category: rs.customCategory ? rs.category : prev.category,
          categoryId: rs.customCategory ? rs.categoryId : prev.categoryId,
          streamUrl: String(rs.streamUrl ?? prev.streamUrl ?? "").trim(),
          episodes: Array.isArray(rs.episodes) && rs.episodes.length ? rs.episodes : prev.episodes,
          tier: rs.tier || prev.tier || "free"
        });
      } else {
        byImdb.set(k, { ...rs, _adminCustom: true });
      }
    }
  }

  let nextAutoSeriesId = 15000;
  const usedSeriesIds = new Set();
  const normalized = [];
  let idx = 0;

  for (const s of byImdb.values()) {
    const imdbId = String(s.imdbId || `tt000${10001 + idx}`).trim().toLowerCase();
    let seriesId = Number(s.seriesId) || 10001 + idx;
    while (usedSeriesIds.has(seriesId)) seriesId = nextAutoSeriesId++;
    usedSeriesIds.add(seriesId);

    const cat =
      SERIES_CATEGORIES.find((c) => c.id === String(s.categoryId) || c.name === s.category) ||
      inferSeriesCategory(s);

    const episodes =
      Array.isArray(s.episodes) && s.episodes.length
        ? s.episodes
        : [
            {
              id: `${seriesId}0101`,
              season: 1,
              episode: 1,
              title: `${s.title || "Series"} — S01E01`,
              plot: s.plot || "Service is building — Coming Soon on BarakatWave TV!",
              duration: s.runtime || "45 min",
              streamUrl: ""
            }
          ];

    normalized.push({
      ...s,
      id: s.id || `ser_${imdbId}`,
      seriesId,
      imdbId,
      title: s.title || `IMDb Series (${imdbId})`,
      year: String(s.year || "2024"),
      imdbRating: String(s.imdbRating || "8.2"),
      runtime: String(s.runtime || "45 min"),
      genres: Array.isArray(s.genres)
        ? s.genres
        : String(s.genres || "Drama")
            .split(",")
            .map((g) => g.trim()),
      category: cat.name,
      categoryId: String(cat.id),
      poster: s.poster || metahubPoster(imdbId),
      backdrop: s.backdrop || metahubBackdrop(imdbId),
      tier: String(s.tier || "free").toLowerCase() === "pro" ? "pro" : "free",
      streamUrl: String(s.streamUrl || "").trim(),
      episodes,
      seasonsCount:
        Number(s.seasonsCount) || new Set(episodes.map((e) => Number(e.season) || 1)).size || 1,
      order: s._adminCustom ? -1000 + idx : idx + 1
    });
    idx++;
  }

  normalized.sort((a, b) => (a.order ?? 99999) - (b.order ?? 99999));
  mergedCatalogCache.series = normalized;
  mergedCatalogCache.seriesAt = now;
  return normalized;
}

export function getVodCategoriesList(movies = []) {
  const map = new Map();
  for (const c of VOD_CATEGORIES) {
    map.set(String(c.id), {
      category_id: String(c.id),
      category_name: c.xtreamTitle || c.name,
      parent_id: 0
    });
  }
  for (const m of movies) {
    const cid = String(m.categoryId || "101");
    if (!map.has(cid)) {
      map.set(cid, {
        category_id: cid,
        category_name: decorateGroupTitle(m.category || "🎬 IMDb MOVIES"),
        parent_id: 0
      });
    }
  }
  return [...map.values()];
}

export function getSeriesCategoriesList(seriesList = []) {
  const map = new Map();
  for (const c of SERIES_CATEGORIES) {
    map.set(String(c.id), {
      category_id: String(c.id),
      category_name: c.xtreamTitle || c.name,
      parent_id: 0
    });
  }
  for (const s of seriesList) {
    const cid = String(s.categoryId || "201");
    if (!map.has(cid)) {
      map.set(cid, {
        category_id: cid,
        category_name: decorateGroupTitle(s.category || "📺 IMDb SERIES"),
        parent_id: 0
      });
    }
  }
  return [...map.values()];
}
