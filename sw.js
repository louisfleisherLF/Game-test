/* Cache-first service worker so the games work offline once visited. Bump CACHE when files change. */
const CACHE = 'minigames-v1';
const FILES = ['./', './index.html', './manifest.json', './gfx.js', './common.js', './words.js',
  './match3.js', './tetris.js', './g2048.js', './wordle.js', './icon-192.png', './icon-512.png', './icon-180.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
