/**
 * Service worker of the studio. The build (build/sw-plugin.ts) fills in VERSION and PRECACHE.
 *
 * - Install: stores the page and every script, style, worker and font, so the studio opens
 *   offline. Large files, such as the 27 MB model runtime, are stored the first time they are used.
 * - Fetch: files from this site come from the store first. The page itself comes from the network
 *   first, so you get a new version when you are online. Other sites, such as model downloads and
 *   the science engine, are never touched.
 * - A new version waits until every studio tab is closed, so a running studio never mixes files
 *   from two versions.
 */
/* global self, caches, URL, Response, __PRECACHE__ */
const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const CACHE = `pixelnexus-studio-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("pixelnexus-studio-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "version") event.source?.postMessage({ version: VERSION });
});

async function fromNetworkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put("./", response.clone());
    return response;
  } catch {
    return (await cache.match("./")) ?? Response.error();
  }
}

async function fromCacheFirst(request) {
  const cache = await caches.open(CACHE);
  const stored = await cache.match(request, { ignoreSearch: true });
  if (stored) return stored;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (request.mode === "navigate") {
    // Only the studio page itself. Other pages, such as the style tile, go to the network.
    const page = url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`;
    if (page) event.respondWith(fromNetworkFirst(request));
    return;
  }
  event.respondWith(fromCacheFirst(request));
});
