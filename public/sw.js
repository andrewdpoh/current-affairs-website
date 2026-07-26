/**
 * Offline support.
 *
 * Shell (HTML/CSS/JS/icons): cache-first, so the app opens instantly and works
 * with no connection at all — useful on a commute or a plane.
 *
 * Data (news.json): network-first with a cache fallback, so you always get the
 * freshest brief when online but still see the last one you downloaded offline.
 */

const VERSION = 'v1';
const SHELL_CACHE = `brief-shell-${VERSION}`;
const DATA_CACHE = `brief-data-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'assets/styles.css',
  'assets/app.js',
  'assets/icon.svg',
  'manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll is atomic: one 404 would leave us with no shell at all, so add
      // each entry independently and tolerate individual misses.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/data/news.json')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
    )
  );
});
