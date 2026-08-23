const CACHE = "nurture-daily-v26";
const ASSETS = [
  "./", "./index.html", "./styles.css?v=26", "./push-config.js?v=26", "./firebase-config.js?v=26",
  "./identity-core.js?v=26", "./native-bridge.js?v=26", "./auth.js?v=26", "./app.js?v=26", "./manifest.webmanifest?v=26", "./icon.svg?v=20",
  "./icons/icon-180.png?v=20", "./icons/icon-192.png?v=20", "./icons/icon-512.png?v=20"
];

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
  const firebaseModule = requestUrl.origin === "https://www.gstatic.com" && requestUrl.pathname.startsWith("/firebasejs/12.17.1/");
  if (firebaseModule) {
    event.respondWith(caches.match(event.request).then(async cached => {
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(event.request, response.clone());
      }
      return response;
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
    icon: "./icons/icon-192.png?v=20",
    badge: "./icons/icon-192.png?v=20",
    tag: message.tag || "nurture-feeding-alarm",
    renotify: true,
    data: { url: message.url || "./" }
  }));
});
