const CACHE_PREFIX = 'alex-projects-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v1.0.1`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/constants.js',
  './js/db.js',
  './js/router.js',
  './js/views.js',
  './js/integration.js',
  './js/services/project-service.js',
  './js/services/task-service.js',
  './js/services/milestone-service.js',
  './js/services/project-intelligence.js',
  './js/services/note-service.js',
  './js/services/reference-service.js',
  './js/services/timeline-service.js',
  './js/services/template-service.js',
  './js/services/backup-service.js',
  './js/services/integration-service.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function fetchWithTimeout(request, ms = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(request, { signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetchWithTimeout(event.request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('./index.html', response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  })());
});
