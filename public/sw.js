const CACHE_NAME = "barakatwave-tv-v2";
const SHELL_ASSETS = [
  "/assets/css/styles.css",
  "/assets/logo-fallback.svg",
  "/assets/vendor/hls.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
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
  // Never cache live HLS manifests, segments, Xtream API, or Firebase calls
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/live/") ||
    url.pathname.startsWith("/ch/") ||
    url.pathname.endsWith(".m3u8") ||
    url.pathname.endsWith(".ts") ||
    url.pathname.endsWith(".php") ||
    url.origin !== self.location.origin
  ) {
    return;
  }
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
