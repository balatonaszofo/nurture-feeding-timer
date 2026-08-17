const CACHE = "nurture-v10";
const ASSETS = ["./", "./index.html", "./styles.css?v=10", "./push-config.js?v=10", "./app.js?v=10", "./manifest.webmanifest?v=10", "./icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin === self.location.origin) {
    event.respondWith(fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") return caches.match("./");
      return Response.error();
    }));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
      const existing = windows.find(client => "focus" in client);
      return existing ? existing.focus() : clients.openWindow("./");
    })
  );
});

self.addEventListener("push", event => {
  let message = {};
  try {
    message = event.data?.json() || {};
  } catch {
    message = { body: event.data?.text() || "The feeding timer has reached zero." };
  }
  event.waitUntil(self.registration.showNotification(message.title || "It's feeding time", {
    body: message.body || "The feeding timer has reached zero.",
    icon: "./icon.svg",
    badge: "./icon.svg",
    tag: message.tag || "nurture-feeding-alarm",
    renotify: true,
    data: { url: message.url || "./" }
  }));
});
