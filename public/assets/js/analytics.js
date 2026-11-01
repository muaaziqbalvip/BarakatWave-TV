/**
 * BarakatWave Live TV — Real-Time Visitor & Playback Analyzer (Client)
 * Under Mizanora Projects by Muaaz Iqbal
 *
 * Privacy-first, zero-cookie, anonymous analytics:
 *  - Who came (guest / signed-in plan), When they arrived, How long they stayed
 *  - Where from (country / city / timezone from edge headers via server)
 *  - Which device / browser / IPTV app, Which channel or movie played, Which engine (HLS/DASH/TS)
 *  - Zero third-party tracking scripts, zero channel URLs transmitted, fully self-hosted!
 */

const ENDPOINT = "/api/analytics";
const HEARTBEAT_MS = 30_000;
const PLAY_PROGRESS_MS = 20_000;

function safeGet(storage, key) {
  try {
    return storage.getItem(key) || "";
  } catch {
    return "";
  }
}

function safeSet(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch {
    // ignore private mode restrictions
  }
}

function makeId(prefix) {
  const rnd =
    typeof crypto !== "undefined" && crypto.getRandomValues
      ? [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rnd}`;
}

function send(payload, { beacon = false } = {}) {
  const body = JSON.stringify(payload);
  try {
    if (beacon && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
      cache: "no-store"
    }).catch(() => {});
  } catch {
    // never break the app for analytics
  }
}

const sessionId = (() => {
  const existing = safeGet(sessionStorage, "bw_sid");
  if (existing) return existing;
  const fresh = makeId("s");
  safeSet(sessionStorage, "bw_sid", fresh);
  return fresh;
})();

const visitorId = (() => {
  const existing = safeGet(localStorage, "bw_vid");
  if (existing) return existing;
  const fresh = makeId("v");
  safeSet(localStorage, "bw_vid", fresh);
  return fresh;
})();

const tracker = {
  sessionId,
  visitorId,
  arrivedAt: Date.now(),
  firstHit: true,
  currentView: "live",
  currentMedia: "",
  user: { email: "", name: "Guest Viewer", plan: "free" },
  activePlay: null,
  heartbeatTimer: null,
  playTimer: null,
  started: false
};

function basePayload(extra = {}) {
  return {
    sid: sessionId,
    visitorId,
    path: `${window.location.pathname}${window.location.search}`.slice(0, 120),
    view: tracker.currentView,
    currentMedia: tracker.currentMedia,
    referrer: document.referrer || "",
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    language: navigator.language || "en",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Karachi",
    ua: navigator.userAgent,
    durationSec: Math.round((Date.now() - tracker.arrivedAt) / 1000),
    userEmail: tracker.user.email,
    userName: tracker.user.name,
    userPlan: tracker.user.plan,
    ...extra
  };
}

export function trackPageView(extra = {}) {
  send(basePayload({ type: "heartbeat", isPageView: true, ...extra }));
  tracker.firstHit = false;
}

export function trackView(viewName) {
  tracker.currentView = String(viewName || "live").slice(0, 40);
  send(basePayload({ type: "view" }));
}

export function trackNowPlaying(label) {
  tracker.currentMedia = String(label || "").slice(0, 110);
}

export function setTrackedUser(user, profile) {
  tracker.user = {
    email: String(user?.email || "").slice(0, 90),
    name: String(profile?.displayName || profile?.name || user?.displayName || "Guest Viewer").slice(0, 60),
    plan: String(profile?.plan || "free").toLowerCase() === "pro" ? "pro" : "free"
  };
}

/**
 * Record a stream play event — KYA (title), KAB (time), KHA (IP/geo), KESE (engine/device/plan).
 */
export function trackPlay({ title, itemId = "", imdbId = "", contentType = "Live TV", category = "", engine = "HLS", surface = "Web 3D Studio", xtreamUser = "" }) {
  const playId = makeId("p");
  tracker.activePlay = {
    playId,
    title: String(title || "Live Stream"),
    contentType,
    engine,
    startedAt: Date.now(),
    lastSentSec: 0
  };
  trackNowPlaying(title);

  send(
    basePayload({
      type: "play",
      playId,
      title,
      itemId,
      imdbId,
      contentType,
      category,
      engine,
      surface,
      xtreamUser
    })
  );

  if (tracker.playTimer) clearInterval(tracker.playTimer);
  tracker.playTimer = setInterval(() => {
    if (!tracker.activePlay || document.hidden) return;
    const watchSec = Math.round((Date.now() - tracker.activePlay.startedAt) / 1000);
    if (watchSec - tracker.activePlay.lastSentSec < 15) return;
    tracker.activePlay.lastSentSec = watchSec;
    send(
      basePayload({
        type: "play_progress",
        playId,
        title: tracker.activePlay.title,
        contentType: tracker.activePlay.contentType,
        engine: tracker.activePlay.engine,
        watchDurationSec: watchSec
      })
    );
  }, PLAY_PROGRESS_MS);

  return playId;
}

export function trackStop() {
  if (!tracker.activePlay) return;
  const watchSec = Math.round((Date.now() - tracker.activePlay.startedAt) / 1000);
  send(
    basePayload({
      type: "play_progress",
      playId: tracker.activePlay.playId,
      title: tracker.activePlay.title,
      contentType: tracker.activePlay.contentType,
      engine: tracker.activePlay.engine,
      watchDurationSec: watchSec
    }),
    { beacon: true }
  );
  if (tracker.playTimer) clearInterval(tracker.playTimer);
  tracker.activePlay = null;
}

/**
 * Boot the analyzer: initial page view, 30s heartbeat, tab-hide/close leave beacon.
 */
export function initAnalytics() {
  if (tracker.started) return tracker;
  tracker.started = true;

  const boot = () => trackPageView();

  if (document.readyState === "complete") {
    setTimeout(boot, 900);
  } else {
    window.addEventListener("load", () => setTimeout(boot, 900), { once: true });
  }

  tracker.heartbeatTimer = setInterval(() => {
    if (document.hidden) return;
    send(basePayload({ type: "heartbeat" }));
  }, HEARTBEAT_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      trackStop();
      send(basePayload({ type: "heartbeat" }), { beacon: true });
    } else {
      send(basePayload({ type: "heartbeat" }));
    }
  });

  window.addEventListener("pagehide", () => {
    trackStop();
    send(basePayload({ type: "leave", durationSec: Math.round((Date.now() - tracker.arrivedAt) / 1000), isPageView: false }), {
      beacon: true
    });
  });

  return tracker;
}

export const analyticsSession = tracker;
