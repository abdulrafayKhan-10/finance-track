/*
 * Finance Track service worker (docs/06 §6.6, docs/05 "service worker caches private data").
 *
 * - Caches ONLY hashed static build files (/_next/static/*), the icons and the
 *   offline page. These contain no personal data.
 * - Page navigations, server actions, exports and Supabase calls always go to
 *   the network and are never stored. When a navigation fails (offline), the
 *   offline page is shown instead.
 * - The cache is versioned; old versions are deleted on activate. The app asks
 *   the worker to clear everything on sign-out.
 */
const VERSION = "ft-static-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload", credentials: "omit" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-caches") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

const isStatic = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    // Network only; never cache a page (they hold private data).
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) ?? new Response("Offline", { status: 503 })),
    );
    return;
  }

  if (isStatic(url)) {
    // Hashed file names never change content, so cache-first is safe.
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok && response.type === "basic") {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
  // Everything else (RSC payloads, actions, exports, Supabase) is left to the network.
});
