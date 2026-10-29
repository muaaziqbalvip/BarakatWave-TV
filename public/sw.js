const CACHE_NAME = "barakatwave-tv-3d-v4";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/assets/css/styles.css",
  "/assets/logo-fallback.svg",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/apple-touch-icon.png",
  "/assets/vendor/hls.min.js",
  "/assets/vendor/shaka-player.min.js",
  "/assets/vendor/mpegts.min.js"
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
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("/index.html")))
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
