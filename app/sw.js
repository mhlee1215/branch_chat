const CACHE_NAME = 'branching-chat-gui-v78';
const ASSETS = [
  '/',
  '/app/index.html',
  '/app/styles.css',
  '/app/main.js',
  '/app/manifest.webmanifest',
  '/src/domain/block-editor.js',
  '/src/domain/context-builder.js',
  '/src/domain/mock-ai.js',
  '/src/domain/workspace-store.js',
  '/src/domain/api-client.js',
  '/src/utils/ids.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
