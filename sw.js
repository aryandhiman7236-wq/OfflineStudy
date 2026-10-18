
const CACHE = "study-vault-shell-v1";

const FILES = [
  "./",
  "./index.html",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k =>
            k.startsWith("study-vault-shell-") &&
            k !== CACHE
          )
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () =>
        (await caches.match(req)) ||
        (await caches.match("./index.html")) ||
        (await caches.match("./"))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req)
    )
  );
});
