
const CACHE_NAME = "study-vault-offline-v2";
const BASE_URL = self.registration.scope;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      await cache.addAll([
        BASE_URL,
        BASE_URL + "index.html",
        BASE_URL + "manifest.json"
      ]);

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter((key) =>
            key.startsWith("study-vault-offline-") &&
            key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        const cachedPage =
          await cache.match(request) ||
          await cache.match(BASE_URL) ||
          await cache.match(BASE_URL + "index.html");

        if (cachedPage) return cachedPage;

        return fetch(request);
      })()
    );

    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);

      if (cached) return cached;

      return fetch(request);
    })()
  );
});
