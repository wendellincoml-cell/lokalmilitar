const CACHE_NAME = "lokal-militar-pwa-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL);
      const appShell = await cache.match("/index.html");
      const html = await appShell.text();
      const staticAssets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
        .map(([, assetPath]) => new URL(assetPath, self.location.origin))
        .filter(
          (assetUrl) =>
            assetUrl.origin === self.location.origin &&
            assetUrl.pathname.startsWith("/static/"),
        )
        .map((assetUrl) => assetUrl.href);
      await cache.addAll(staticAssets);
    })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName.startsWith("lokal-militar-pwa-") &&
                cacheName !== CACHE_NAME,
            )
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const appShell = await caches.match("/index.html");
        if (!appShell) throw new Error("O app ainda não foi carregado neste dispositivo.");
        return appShell;
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cachedResponse) =>
          cachedResponse ||
          fetch(request).then((response) => {
            if (response.ok && response.type === "basic") {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
            }
            return response;
          }),
      ),
    );
  }
});
