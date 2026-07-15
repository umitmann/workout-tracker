const CACHE_VERSION = 'workout-shell-v1'
const SHELL_ASSETS = [
  '/offline',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_ASSETS)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

function isPrivateOrDynamic(pathname) {
  return pathname.startsWith('/api/')
    || pathname.startsWith('/auth/')
    || pathname.startsWith('/account')
    || pathname.startsWith('/dashboard')
    || pathname.startsWith('/workout')
    || pathname.startsWith('/routines')
    || pathname.startsWith('/connections')
    || pathname.startsWith('/trainers')
    || pathname.startsWith('/admin')
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Authenticated pages and server/API data are network-only. A failed page
  // navigation may show the public offline explanation, but private response
  // bodies are never written to Cache Storage.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline')))
    return
  }
  if (isPrivateOrDynamic(url.pathname)) return

  const cacheableStaticAsset = url.pathname.startsWith('/_next/static/')
    || SHELL_ASSETS.includes(url.pathname)
  if (!cacheableStaticAsset) return

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (!response.ok || response.type !== 'basic') return response
      const copy = response.clone()
      caches.open(CACHE_VERSION).then((cache) => cache.put(request.clone(), copy))
      return response
    })),
  )
})
