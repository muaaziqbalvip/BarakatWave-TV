import { getClientIp } from "./security.js";
import { rtdbGet, rtdbSet } from "./rtdb.js";

/**
 * BarakatWave Live TV — Real-Time Web App Visitor & Stream Playback Analyzer Engine
 * Engineered under Mizanora Projects by Muaaz Iqbal
 *
 * Tracks:
 *  1) Visitor Sessions: Who came (User/Guest + IP), When they arrived, How long they stayed (Duration),
 *     Where from (Country Flag, City, Region, Timezone, Referrer), Device/OS/Browser, Online Right Now!
 *  2) Stream Play Events: What played (Channel / Movie / Series / Custom MPD/M3U8), When, Where (IP + Geo),
 *     How (Protocol Engine: HLS / DASH .mpd / MPEG-TS / IMDb Player / Xtream IPTV App + Device), Watch Duration!
 */

const COUNTRY_NAMES = {
  PK: "🇵🇰 Pakistan",
  IN: "🇮🇳 India",
  SA: "🇸🇦 Saudi Arabia",
  AE: "🇦🇪 UAE",
  QA: "🇶🇦 Qatar",
  OM: "🇴🇲 Oman",
  KW: "🇰🇼 Kuwait",
  BH: "🇧🇭 Bahrain",
  TR: "🇹🇷 Türkiye",
  GB: "🇬🇧 United Kingdom",
  US: "🇺🇸 United States",
  CA: "🇨🇦 Canada",
  AU: "🇦🇺 Australia",
  DE: "🇩🇪 Germany",
  FR: "🇫🇷 France",
  IT: "🇮🇹 Italy",
  ES: "🇪🇸 Spain",
  MY: "🇲🇾 Malaysia",
  BD: "🇧🇩 Bangladesh",
  AF: "🇦🇫 Afghanistan"
};

const TZ_COUNTRY_FALLBACK = {
  "asia/karachi": { code: "PK", city: "Pakistan" },
  "asia/kolkata": { code: "IN", city: "India" },
  "asia/calcutta": { code: "IN", city: "India" },
  "asia/riyadh": { code: "SA", city: "Saudi Arabia" },
  "asia/dubai": { code: "AE", city: "Dubai" },
  "asia/qatar": { code: "QA", city: "Doha" },
  "europe/london": { code: "GB", city: "London" },
  "europe/istanbul": { code: "TR", city: "Istanbul" },
  "america/new_york": { code: "US", city: "New York" },
  "america/los_angeles": { code: "US", city: "Los Angeles" },
  "america/toronto": { code: "CA", city: "Toronto" }
};

const memSessions = new Map();
const memPlays = [];
let hydratedFromRtdb = false;
let lastRtdbHydrateAt = 0;

function countryFlagAndName(code) {
  const up = String(code || "").trim().toUpperCase();
  if (!up || up === "XX" || up === "UNKNOWN") return "🌐 Global";
  if (COUNTRY_NAMES[up]) return COUNTRY_NAMES[up];
  if (/^[A-Z]{2}$/.test(up)) {
    const flag = String.fromCodePoint(...[...up].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
    return `${flag} ${up}`;
  }
  return `🌐 ${up}`;
}

function safeDecode(val) {
  if (!val) return "";
  try {
    return decodeURIComponent(String(val));
  } catch {
    return String(val);
  }
}

export function extractGeoAndClient(req, clientHints = {}) {
  const headers = req?.headers || {};
  const ip = getClientIp(req);

  let countryCode = String(
    headers["x-vercel-ip-country"] || headers["cf-ipcountry"] || clientHints.countryCode || ""
  )
    .trim()
    .toUpperCase();
  let city = safeDecode(headers["x-vercel-ip-city"] || headers["cf-ipcity"] || "");
  let region = safeDecode(headers["x-vercel-ip-country-region"] || headers["cf-region"] || "");
  const timezone = String(
    headers["x-vercel-ip-timezone"] || clientHints.timezone || "Asia/Karachi"
  ).trim();

  if (!countryCode || countryCode === "XX") {
    const tzHit = TZ_COUNTRY_FALLBACK[timezone.toLowerCase()];
    if (tzHit) {
      countryCode = tzHit.code;
      if (!city) city = tzHit.city;
    }
  }

  const ua = String(headers["user-agent"] || clientHints.ua || "");
  const uaLow = ua.toLowerCase();

  // Detect IPTV Apps first, then Browsers
  let appOrBrowser = "Web Browser";
  let isIptvApp = false;
  if (uaLow.includes("televizo")) {
    appOrBrowser = "📺 Televizo IPTV";
    isIptvApp = true;
  } else if (uaLow.includes("tivimate")) {
    appOrBrowser = "📺 TiviMate IPTV";
    isIptvApp = true;
  } else if (uaLow.includes("smarters") || uaLow.includes("iptvsmarters")) {
    appOrBrowser = "📺 IPTV Smarters";
    isIptvApp = true;
  } else if (uaLow.includes("vlc") || uaLow.includes("libvlc")) {
    appOrBrowser = "🎬 VLC Player";
    isIptvApp = true;
  } else if (uaLow.includes("OTT Navigator".toLowerCase()) || uaLow.includes("ott")) {
    appOrBrowser = "📺 OTT Navigator";
    isIptvApp = true;
  } else if (uaLow.includes("exoplayer") || uaLow.includes("androidx.media3") || uaLow.includes("lavf")) {
    appOrBrowser = "📺 Android IPTV Player";
    isIptvApp = true;
  } else if (uaLow.includes("edg/")) {
    appOrBrowser = "Edge";
  } else if (uaLow.includes("opr/") || uaLow.includes("opera")) {
    appOrBrowser = "Opera";
  } else if (uaLow.includes("samsungbrowser")) {
    appOrBrowser = "Samsung Internet";
  } else if (uaLow.includes("chrome/") || uaLow.includes("crios/")) {
    appOrBrowser = "Chrome";
  } else if (uaLow.includes("firefox/") || uaLow.includes("fxios/")) {
    appOrBrowser = "Firefox";
  } else if (uaLow.includes("safari/")) {
    appOrBrowser = "Safari";
  }

  // Detect OS
  let os = "Other";
  if (uaLow.includes("android tv") || uaLow.includes("googletv") || uaLow.includes("aftm") || uaLow.includes("bravia")) {
    os = "Android TV";
  } else if (uaLow.includes("android")) {
    os = "Android";
  } else if (uaLow.includes("iphone") || uaLow.includes("ipad") || uaLow.includes("ipod")) {
    os = "iOS / iPadOS";
  } else if (uaLow.includes("windows")) {
    os = "Windows";
  } else if (uaLow.includes("mac os x") || uaLow.includes("macintosh")) {
    os = "macOS";
  } else if (uaLow.includes("linux")) {
    os = "Linux";
  }

  // Detect Device Type
  let deviceType = "💻 Laptop / Desktop";
  if (isIptvApp || os === "Android TV" || uaLow.includes("smart-tv") || uaLow.includes("tizen") || uaLow.includes("webos")) {
    deviceType = "📺 Smart TV / IPTV";
  } else if (uaLow.includes("ipad") || uaLow.includes("tablet")) {
    deviceType = "📲 Tablet";
  } else if (uaLow.includes("mobi") || uaLow.includes("android") || uaLow.includes("iphone")) {
    deviceType = "📱 Mobile Phone";
  }

  const countryLabel = countryFlagAndName(countryCode);
  const locationLabel = [city, region, countryLabel].filter(Boolean).join(", ");

  return {
    ip,
    countryCode: countryCode || "GL",
    countryLabel,
    city: city || "—",
    region: region || "",
    timezone,
    locationLabel,
    deviceType,
    os,
    browser: appOrBrowser,
    isIptvApp
  };
}

function formatPktTime(ts) {
  try {
    return new Intl.DateTimeFormat("en-PK", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString();
  }
}

function cleanKey(raw, fallback = "anon") {
  const s = String(raw || fallback).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  return s || fallback;
}

async function ensureHydrated() {
  const now = Date.now();
  if (hydratedFromRtdb && now - lastRtdbHydrateAt < 12000) return;
  hydratedFromRtdb = true;
  lastRtdbHydrateAt = now;

  try {
    const [remoteSessions, remotePlays] = await Promise.all([
      rtdbGet("analytics/sessions", { ttlMs: 4000 }),
      rtdbGet("analytics/plays", { ttlMs: 4000 })
    ]);

    if (remoteSessions && typeof remoteSessions === "object") {
      for (const [k, v] of Object.entries(remoteSessions)) {
        if (!v || typeof v !== "object") continue;
        const prev = memSessions.get(k);
        if (!prev || (Number(v.lastSeenAt) || 0) >= (Number(prev.lastSeenAt) || 0)) {
          memSessions.set(k, v);
        }
      }
    }

    if (remotePlays && typeof remotePlays === "object") {
      const seenIds = new Set(memPlays.map((p) => p.id));
      const vals = Array.isArray(remotePlays) ? remotePlays : Object.values(remotePlays);
      for (const p of vals) {
        if (p && p.id && !seenIds.has(p.id)) {
          seenIds.add(p.id);
          memPlays.push(p);
        }
      }
      memPlays.sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
      if (memPlays.length > 350) memPlays.length = 350;
    }
  } catch {
    // non-blocking
  }
}

export async function recordVisitorSession(req, payload = {}) {
  const now = Date.now();
  const sid = cleanKey(payload.sid, `s_${now.toString(36)}`);
  const meta = extractGeoAndClient(req, payload);

  const existing = memSessions.get(sid);
  const startedAt = existing?.startedAt || now;
  const elapsedSec = Math.max(0, Math.round((now - startedAt) / 1000));
  const reportedSec = Number(payload.durationSec) || 0;
  const durationSec = Math.max(existing?.durationSec || 0, reportedSec, Math.min(elapsedSec, 86400));

  let refLabel = String(payload.referrer || existing?.referrer || "Direct / Bookmark").trim();
  if (refLabel.startsWith("http")) {
    try {
      const u = new URL(refLabel);
      refLabel = u.hostname.replace(/^www\./, "");
    } catch {
      // keep raw
    }
  }

  const record = {
    sid,
    visitorId: cleanKey(payload.visitorId || sid, sid),
    ip: meta.ip,
    countryCode: meta.countryCode,
    countryLabel: meta.countryLabel,
    city: meta.city !== "—" ? meta.city : existing?.city || "—",
    region: meta.region || existing?.region || "",
    locationLabel: meta.locationLabel,
    timezone: meta.timezone,
    deviceType: meta.deviceType,
    os: meta.os,
    browser: meta.browser,
    screen: String(payload.screen || existing?.screen || "").slice(0, 24),
    language: String(payload.language || existing?.language || "en").slice(0, 16),
    referrer: refLabel.slice(0, 80),
    entryPath: String(payload.path || existing?.entryPath || "/").slice(0, 120),
    currentView: String(payload.view || existing?.currentView || "live").slice(0, 40),
    currentMedia: String(
      payload.currentMedia !== undefined ? payload.currentMedia : existing?.currentMedia || ""
    ).slice(0, 110),
    userEmail: String(payload.userEmail || existing?.userEmail || "").slice(0, 90),
    userName: String(payload.userName || existing?.userName || "Guest Viewer").slice(0, 60),
    userPlan: String(payload.userPlan || existing?.userPlan || "free").slice(0, 16),
    startedAt,
    startedPkt: existing?.startedPkt || formatPktTime(startedAt),
    lastSeenAt: payload.leaving ? now - 70_000 : now,
    lastSeenPkt: formatPktTime(now),
    durationSec,
    pageViews: (existing?.pageViews || 0) + (payload.isPageView ? 1 : existing ? 0 : 1),
    streamsPlayed: existing?.streamsPlayed || 0
  };

  memSessions.set(sid, record);
  if (memSessions.size > 400) {
    const oldestKey = [...memSessions.entries()].sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt)[0]?.[0];
    if (oldestKey) memSessions.delete(oldestKey);
  }

  // Persist non-blocking to RTDB
  rtdbSet(`analytics/sessions/${sid}`, record).catch(() => {});
  return record;
}

export async function recordStreamPlay(req, payload = {}) {
  const now = Date.now();
  const meta = extractGeoAndClient(req, payload);
  const pid = cleanKey(
    payload.playId,
    `p_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  );

  // If updating watch duration of an existing play event
  const existingIdx = memPlays.findIndex((p) => p.id === pid);
  if (existingIdx >= 0 && payload.watchDurationSec !== undefined) {
    const updated = {
      ...memPlays[existingIdx],
      watchDurationSec: Math.max(
        memPlays[existingIdx].watchDurationSec || 0,
        Math.round(Number(payload.watchDurationSec) || 0)
      ),
      lastActiveAt: now
    };
    memPlays[existingIdx] = updated;
    rtdbSet(`analytics/plays/${pid}`, updated).catch(() => {});
    return updated;
  }

  const sid = payload.sid ? cleanKey(payload.sid, "") : "";
  if (sid && memSessions.has(sid)) {
    const s = memSessions.get(sid);
    s.streamsPlayed = (s.streamsPlayed || 0) + 1;
    s.currentMedia = String(payload.title || payload.itemId || "").slice(0, 110);
    s.lastSeenAt = now;
    rtdbSet(`analytics/sessions/${sid}`, s).catch(() => {});
  }

  const playRec = {
    id: pid,
    sid,
    ts: now,
    playedPkt: formatPktTime(now),
    // KYA (What played)
    title: String(payload.title || "Live Stream").slice(0, 120),
    itemId: String(payload.itemId || "").slice(0, 64),
    imdbId: String(payload.imdbId || "").slice(0, 20),
    contentType: String(payload.contentType || "Live TV").slice(0, 32),
    category: String(payload.category || "").slice(0, 64),
    // KHA (Where + IP)
    ip: meta.ip,
    countryCode: meta.countryCode,
    countryLabel: meta.countryLabel,
    city: meta.city,
    region: meta.region,
    locationLabel: meta.locationLabel,
    surface: String(
      payload.surface || (meta.isIptvApp ? "External IPTV App" : "Web 3D Studio")
    ).slice(0, 48),
    // KESE (How + Device + Engine + User)
    engine: String(payload.engine || "HLS").toUpperCase().slice(0, 32),
    deviceType: meta.deviceType,
    os: meta.os,
    browser: meta.browser,
    userLabel: String(
      payload.userEmail || payload.xtreamUser || payload.userName || "Guest"
    ).slice(0, 80),
    userPlan: String(payload.userPlan || "free").slice(0, 16),
    watchDurationSec: Math.max(0, Math.round(Number(payload.watchDurationSec) || 0))
  };

  memPlays.unshift(playRec);
  if (memPlays.length > 350) memPlays.length = 350;

  rtdbSet(`analytics/plays/${pid}`, playRec).catch(() => {});
  return playRec;
}

export async function clearAllAnalytics() {
  memSessions.clear();
  memPlays.length = 0;
  await Promise.all([
    rtdbSet("analytics/sessions", null),
    rtdbSet("analytics/plays", null)
  ]);
}

function topCounts(items, keyFn, limit = 8) {
  const counts = new Map();
  for (const item of items) {
    const k = keyFn(item);
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

export async function getAnalyticsDashboardSnapshot() {
  await ensureHydrated();
  const now = Date.now();
  const ONLINE_WINDOW_MS = 75_000;

  const sessions = [...memSessions.values()]
    .map((s) => ({
      ...s,
      isOnline: now - (Number(s.lastSeenAt) || 0) <= ONLINE_WINDOW_MS
    }))
    .sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return (Number(b.lastSeenAt) || 0) - (Number(a.lastSeenAt) || 0);
    });

  const plays = [...memPlays].sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));

  const onlineNow = sessions.filter((s) => s.isOnline).length;
  const uniqueIps = new Set([
    ...sessions.map((s) => s.ip),
    ...plays.map((p) => p.ip)
  ].filter(Boolean)).size;

  const totalSessionSec = sessions.reduce((acc, s) => acc + (Number(s.durationSec) || 0), 0);
  const avgSessionSec = sessions.length ? Math.round(totalSessionSec / sessions.length) : 0;
  const totalWatchSec = plays.reduce((acc, p) => acc + (Number(p.watchDurationSec) || 0), 0);
  const iptvPlays = plays.filter((p) => p.surface.toLowerCase().includes("iptv")).length;
  const webPlays = plays.length - iptvPlays;

  return {
    ok: true,
    generatedAt: new Date(now).toISOString(),
    generatedPkt: formatPktTime(now),
    summary: {
      onlineNow,
      totalSessions: sessions.length,
      uniqueIps,
      totalPlays: plays.length,
      webPlays,
      iptvPlays,
      avgSessionSec,
      totalSessionSec,
      totalWatchSec
    },
    breakdowns: {
      countries: topCounts([...sessions, ...plays], (x) => x.countryLabel, 8),
      cities: topCounts(
        [...sessions, ...plays].filter((x) => x.city && x.city !== "—"),
        (x) => `${x.city} (${x.countryCode})`,
        8
      ),
      devices: topCounts(sessions.length ? sessions : plays, (x) => x.deviceType, 6),
      browsers: topCounts([...sessions, ...plays], (x) => x.browser, 8),
      referrers: topCounts(sessions, (x) => x.referrer || "Direct", 6),
      topWatched: topCounts(plays, (p) => `${p.title} [${p.contentType}]`, 10),
      protocols: topCounts(plays, (p) => p.engine, 6)
    },
    sessions: sessions.slice(0, 150),
    plays: plays.slice(0, 200)
  };
}
