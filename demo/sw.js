// Staff Portal — Service Worker
// Bump CACHE on any change to the portal shell. Phones that already have
// it installed serve the cached copy first, so without a new name they
// would keep the old S&N-branded page indefinitely.
// v4: the portal speaks Afrikaans, chiShona and isiXhosa. Cleaners have
// this installed on their home screens, so without a new name a phone
// could keep serving the English-only shell and the language picker
// would look like it had simply failed to arrive.
const CACHE = 'staff-portal-v4';
const ASSETS = ['/domestic'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Only handle GET — the Cache API rejects PATCH/POST/DELETE,
  // and writes should never be intercepted anyway.
  if (e.request.method !== 'GET') return;

  // Network first, fall back to cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
