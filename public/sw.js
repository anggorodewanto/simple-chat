// Minimal service worker: it makes the app installable and gives navigations a
// friendly offline page. Chat data is never cached — a stale conversation is
// worse than no conversation.
const CACHE = "simple-chat-v2";
const SHELL = ["/offline.html", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  // Static assets: serve from cache when present, otherwise fetch and store.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

// A push arrives whether or not the app is open. If the chat is already on
// screen the message is being delivered live, so a banner would be noise.
self.addEventListener("push", (event) => {
  let payload = { title: "Simple Chat", body: "New message" };

  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Malformed payload: fall back to the generic text above.
  }

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const onScreen = clients.some(
        (client) => client.visibilityState === "visible" && client.focused,
      );

      if (onScreen) return;

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        // One room, so a new message replaces the previous banner.
        tag: "simple-chat",
        renotify: true,
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = clients.find((client) => client.url.includes("/chat"));

      if (existing) {
        await existing.focus();
        return;
      }

      await self.clients.openWindow("/chat");
    })(),
  );
});
