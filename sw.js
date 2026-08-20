/* =========================================================================
   Service worker — enables "Install as App" / APK-wrapping support.
   -------------------------------------------------------------------------
   Strategy: network-first for the app shell (index.html, css, js, vendor,
   icons), so you always get the latest deployed code when online, with a
   cached fallback only when offline. This never caches anything from
   api.github.com — inventory data, remarks, and the activity feed are
   always fetched live, exactly as before. Bump CACHE_VERSION any time you
   want to force every installed copy to drop old cached files.
   ========================================================================= */

const CACHE_VERSION = "over6-shell-v1";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/config.js",
  "./js/github.js",
  "./js/app.js",
  "./js/showroom.js",
  "./vendor/chart.umd.js",
  "./vendor/xlsx.full.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept GitHub API calls (or any other cross-origin request) —
  // inventory/remarks/showroom/activity data must always be live.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const copy = networkResponse.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return networkResponse;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
  );
});
