// Incrémenter VERSION à chaque déploiement pour que l'iPhone récupère la nouvelle version.
const VERSION = 5;
const CACHE = `leanfree-v${VERSION}`;
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'calc.js', 'store.js', 'gemini.js', 'off.js', 'sync.js', 'vendor/zxing.min.js', 'manifest.json'];

self.oninstall = e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
};

self.onactivate = e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
};

self.onfetch = e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
};
