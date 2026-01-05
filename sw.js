const CACHE_NAME = "lakhya-v2";
const ASSETS = ["./", "./index.html", "./script.js", "./manifest.json"];

self.addEventListener("install", e => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", e => {
    e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});

self.addEventListener("notificationclick", e => {
    e.notification.close();
    e.waitUntil(clients.openWindow("./"));
});