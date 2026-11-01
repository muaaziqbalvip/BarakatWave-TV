const CACHE_NAME = "barakatwave-tv-3d-v15";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/assets/css/styles.css",
  "/assets/logo-fallback.svg",
  "/assets/img/brand/barakatwave-logo.png",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/apple-touch-icon.png",
  // Media engines (hls / shaka / mpegts / mux ≈ 620 KB) are intentionally NOT
  // precached: player.js fetches them on demand on first playback.
  "/assets/js/app.js?v=15",
  "/assets/js/error-beacon.js?v=15",
  "/assets/js/panel.js?v=15",
  "/assets/js/admin.js?v=15",
  "/assets/js/admin-modern.js?v=2",
  "/assets/js/firebase-client.js?v=15",
  "/assets/js/player.js",
  "/assets/js/vault.js",
  "/assets/js/membership.js",
  "/assets/js/reseller-ledger.js",
  "/assets/js/analytics.js",
  "/assets/js/cinema-player.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache live HLS/DASH/MPEG-TS manifests, video segments, Xtream API, or cross-origin streams
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/live/") ||
    url.pathname.startsWith("/movie/") ||
    url.pathname.startsWith("/series/") ||
    url.pathname.startsWith("/ch/") ||
    url.pathname.startsWith("/media/") ||
    /\.(m3u8|m3u|mpd|ts|m2ts|m4s|mp4|flv|mkv|webm|php)$/i.test(url.pathname)
  ) {
    return;
  }

  // Network-first for HTML documents & JS modules so updates deploy instantaneously, fallback to cache offline
  if (req.mode === "navigate" || /\.(html|js|css)$/i.test(url.pathname) || url.pathname === "/") {
    event.respondWith(
      fetch(req, { cache: "no-cache" })
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          if (req.mode === "navigate") return (await caches.match("/index.html")) || Response.error();
          return Response.error();
        })
    );
    return;
  }

  // Cache-first for immutable icons & vendor engines
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
    )
  );
});
