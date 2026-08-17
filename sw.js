const CACHE = "nurture-v9";
const ASSETS = ["./", "./index.html", "./styles.css", "./push-config.js", "./app.js", "./manifest.webmanifest", "./icon.svg"];

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
