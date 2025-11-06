// A unique name for our cache
const CACHE_NAME = 'semakl-service-app-v1';

// The list of files we want to cache
const urlsToCache = [
  '/',
  '/index.html',
  '/index.tsx',
  // Note: We don't cache the Google API scripts as they are designed to be loaded from Google's servers.
];

// Install event: opens the cache and adds our files to it.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event: serves requests from the cache first.
// If the request is not in the cache, it fetches from the network.
self.addEventListener('fetch', event => {
  // We only want to cache GET requests.
  if (event.request.method !== 'GET') {
    return;
  }
  
  const requestUrl = new URL(event.request.url);

  // Bypass caching for Google API and authentication scripts.
  // This allows them to be fetched directly from the network, preventing
  // issues with their dynamic loading and callback mechanisms.
  if (requestUrl.hostname.includes('google.com') || requestUrl.hostname.includes('googleapis.com')) {
    return; // Let the browser handle the request normally.
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Not in cache - fetch from network
        return fetch(event.request).then(
          response => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
    );
});

// Activate event: clean up old caches.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});