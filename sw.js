const CACHE_NAME = "asistencia-ner-shell-v2";
const APP_ROOT = new URL("./", self.location.href).href;
const INDEX_URL = new URL("./index.html", self.location.href).href;
const SHELL_FILES = [
  APP_ROOT,
  INDEX_URL,
  new URL("./manifest.webmanifest", self.location.href).href,
  new URL("./icon.svg", self.location.href).href
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Cache files one by one so a missing optional icon/manifest does not
    // prevent the essential app page from being available offline.
    const results = await Promise.allSettled(SHELL_FILES.map(async url => {
      const response = await fetch(new Request(url, { cache: "reload" }));
      if (!response.ok) throw new Error("No se pudo guardar " + url);
      await cache.put(url, response);
    }));

    const pageAvailable = await cache.match(INDEX_URL) || await cache.match(APP_ROOT);
    if (!pageAvailable) {
      throw new Error("No se pudo guardar la página principal para uso sin conexión.");
    }

    // Keep the service worker usable even if an optional shell asset fails.
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith("asistencia-ner-shell-") && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request.url, response.clone());
          await cache.put(INDEX_URL, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(request, { ignoreSearch: true })
          || await caches.match(INDEX_URL)
          || await caches.match(APP_ROOT);
        if (cached) return cached;
        return new Response(
          "Asistencia NER: esta página todavía no está guardada para abrirse sin conexión. Conéctese a internet y vuelva a cargarla.",
          { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      return new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});
