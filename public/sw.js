// Tetsu service worker — small, robust, offline-tolerant.
//
// Strategy:
//   • Page navigations → network-first, so an expired session reaches lock.mjs's lock page
//     instead of a cached shell whose /api/garage then 401s. Cached shell when offline.
//   • Hashed assets → cache-first (built JS/CSS are content-hashed, so a runtime cache
//     picks them up on first fetch and serves them offline thereafter).
//   • /api/garage → network-first (fresh corpus when online, last-known when offline).
// Any caching failure is swallowed so the app never breaks because of the SW.
//
// Bumped to v4 on 05AUG26 (ported from Tōge's sw.js, commit 9ed2212): lock.mjs's gate used
// to answer every un-cookied GET outside /api/ with its lock page at 200 text/html —
// including this file's own SHELL entries. cache.addAll() / cache.put() only check
// response.ok, so that HTML could get stored under a URL that should only ever be JS/CSS/JSON,
// poisoning the install past the next real unlock. poisonsCache() below refuses to cache a
// text/html body under any URL that isn't a real HTML entry; install() now fetches SHELL one
// URL at a time under that guard instead of cache.addAll(), so one gated URL can no longer
// abort the whole precache; and this version bump makes activate()'s existing "delete every
// other cache" sweep self-heal a client that got poisoned before this fix shipped.
//
// Bumped to v5 on 30OCT26: the "/" shell used to be cache-first, so once the 30-day cookie
// lapsed an installed app never saw the lock page — it booted, got a 401 and showed the blank
// offline FALLBACK as if the garage were gone.
const CACHE = "tetsu-v5";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg?v=2", "/apple-touch-icon.png?v=2"];

// The only URLs a text/html body is allowed to sit under — a navigation resolves to "/" or
// "/index.html". Everything else in SHELL is JSON/SVG/PNG and must never be HTML: that is
// precisely what lock.mjs's un-cookied-GET lock page looks like once it lands under one of them.
const HTML_URLS = new Set(["/", "/index.html"]);

// True when caching `response` under `url` would poison the cache: an HTML body (the shape of
// lock.mjs's lock page, or any other gate/error page a proxy might inject) landing on a URL that
// is supposed to be something else. Same-origin only — a third-party host answering its own
// content-type is not this file's problem.
function poisonsCache(url, response) {
  if (!response || url.origin !== self.location.origin) return false;
  if (HTML_URLS.has(url.pathname)) return false;
  const ct = response.headers.get("content-type") || "";
  return ct.includes("text/html");
}

// lock.mjs's lock page is a 200 text/html on "/" — legal for poisonsCache(), but caching it
// would serve the gate offline. Everything the gate produces is no-store; the real shell isn't.
const isGateResponse = (response) => (response.headers.get("cache-control") || "").includes("no-store");

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all(SHELL.map((path) => {
      const request = new Request(path);
      // Per-URL fetch instead of cache.addAll(path) — addAll() fails the WHOLE precache the
      // instant one URL 404s or (since the lock gate landed) comes back a 200 text/html lock
      // page for an un-cookied install, which would mean a locked client never gets an app
      // shell cached at all. A URL that fails the fetch or fails the guard is just skipped.
      return fetch(request)
        .then((response) => {
          if (response && response.ok && !poisonsCache(new URL(path, self.location.origin), response)) {
            return cache.put(request, response);
          }
          return null;
        })
        .catch(() => null);
    })))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim()).catch(() => {})
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API: network-first, fall back to cached copy.
  if (url.pathname.startsWith("/api/garage")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && !poisonsCache(url, res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || Response.error()))
    );
    return;
  }

  // Page navigations: network-first, cached shell only when the network is gone.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === "basic" && !isGateResponse(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match("/index.html")).then((r) => r || Response.error())
        )
    );
    return;
  }

  // Hashed assets + the rest of the shell: cache-first, populate the runtime cache on miss.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === "basic" && !poisonsCache(url, res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => Response.error());
    })
  );
});
