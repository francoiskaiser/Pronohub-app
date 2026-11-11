/* Pronohub — service worker : fonctionnement hors ligne et mises à jour.
   Incrémenter VERSION à chaque publication, sinon les joueurs gardent l'ancienne version. */
const VERSION = "pronohub-v6";
const CORE = [
  "./", "index.html", "en/", "en/index.html", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "icon-maskable.png", "apple-touch-icon.png", "firebase-config.js",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Polices et SDK Firebase : cache d'abord
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" ||
      (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/"))) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  // Fichiers de l'app : réseau d'abord, cache si hors ligne
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      if (req.mode === "navigate") return caches.match(url.pathname.includes("/en/") ? "en/index.html" : "index.html");
      return Response.error();
    })));
  }
  // Le reste (Firestore, authentification, résultats sportifs) passe directement par le réseau
});
