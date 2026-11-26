// Offline cache for the dashboard, so a new tab paints instantly and still
// works with no internet. Files are cached the first time they are fetched
// and then served from the cache until the user clicks Update (app.js empties
// the cache and reloads). There is no file list to maintain here.
const CACHE = "custom-newtab-app";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Hand files to the page marked "do not keep", so the browser always comes
// back here for them. Otherwise, right after an update, the page could reuse
// the old copy it still has in memory.
function fresh(res) {
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Only the app's own files. Anything with a query string (the update check)
  // and everything on other sites (favicons, GitHub sync) goes straight out.
  if (url.origin !== self.location.origin || url.search) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    let res = await cache.match(req);
    if (!res) {
      res = await fetch(req.url, { cache: "no-cache" });
      if (!res.ok) return res;
      await cache.put(req, res.clone());
    }
    return fresh(res);
  })());
});
