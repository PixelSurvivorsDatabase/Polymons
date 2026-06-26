const CACHE_NAME = "polymons-shell-v1";
const INDEX_URL = new URL("./index.html", self.location).href;
const CORE_URLS = [
  new URL("./", self.location).href,
  INDEX_URL,
  new URL("./manifest.webmanifest", self.location).href,
  new URL("./icons/icon-192.png", self.location).href,
  new URL("./icons/icon-512.png", self.location).href,
  new URL("./icons/apple-touch-icon.png", self.location).href,
];

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetch(INDEX_URL, { cache: "reload" });
  if (!indexResponse.ok) throw new Error("Could not cache the Polymons shell.");
  await cache.put(INDEX_URL, indexResponse.clone());

  const html = await indexResponse.text();
  const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], INDEX_URL))
    .filter(
      (url) =>
        url.origin === self.location.origin &&
        url.pathname.startsWith(new URL("./", self.location).pathname),
    )
    .map((url) => url.href);

  await Promise.allSettled(
    [...new Set([...CORE_URLS, ...assetUrls])].map(async (url) => {
      const response = await fetch(url, { cache: "reload" });
      if (response.ok) await cache.put(url, response);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheApplicationShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("polymons-shell-") && key !== CACHE_NAME)
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(INDEX_URL, response.clone());
          }
          return response;
        })
        .catch(async () => (await caches.match(INDEX_URL)) || Response.error()),
    );
    return;
  }

  const refreshed = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  });
  event.waitUntil(refreshed.then(() => undefined).catch(() => undefined));
  event.respondWith(caches.match(request).then((cached) => cached || refreshed));
});
