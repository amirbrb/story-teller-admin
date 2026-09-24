// Minimal service worker: exists so the admin app qualifies as an installable PWA (Chromium
// requires an active service worker with a fetch handler for the install prompt). Network-first,
// with the app shell cached only as an offline fallback — admin data must never be served stale.
const CACHE_NAME = 'nibb-admin-shell-v1'
const SHELL_URL = '/'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(SHELL_URL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Only same-origin GETs — Supabase API calls, RPCs and POSTs are left alone entirely.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (request.mode === 'navigate' && response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(SHELL_URL, copy))
        }
        return response
      })
      .catch(() => {
        if (request.mode === 'navigate') return caches.match(SHELL_URL)
        return caches.match(request)
      }),
  )
})
