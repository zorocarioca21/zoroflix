const CACHE_NAME = 'cinegeek-pwa-v1';

// Install event - Faz o SW se instalar logo
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate event - Limpa caches antigos (se houver) e toma o controle rápido
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - PWA Pass-through simples para a web
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
