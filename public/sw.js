const CACHE_VERSION = 'workout-shell-v2'
const COACH_AUDIO_CACHE = 'workout-coach-audio-v1'
const PACKAGED_COACHES = new Set(['maya', 'alex', 'jordan', 'kai'])
const COACH_CUES = [
  'get-ready', 'lower', 'hold', 'up', 'halfway', 'last-rep', 'rest-halfway', 'rest-complete',
  ...Array.from({ length: 50 }, (_, index) => `rep-${index + 1}`),
]
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
      .then((keys) => Promise.all(keys.filter((key) => ![CACHE_VERSION, COACH_AUDIO_CACHE].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type !== 'CACHE_COACH_PACK') return

  const coach = event.data?.coach
  const respond = (message) => {
    if (event.ports?.[0]) event.ports[0].postMessage(message)
    else event.source?.postMessage(message)
  }
  if (!PACKAGED_COACHES.has(coach)) {
    respond({ ok: false, coach, error: 'Unknown coach pack.' })
    return
  }

  const assets = COACH_CUES.map((cue) => `/audio/coaches/${coach}/${cue}.mp3`)
  event.waitUntil(
    caches.open(COACH_AUDIO_CACHE)
      .then(async (cache) => {
        const cached = await Promise.all(assets.map((asset) => cache.match(asset)))
        if (!cached.every(Boolean)) await cache.addAll(assets)
        respond({ type: 'COACH_PACK_CACHED', ok: true, coach, count: assets.length })
      })
      .catch(() => respond({ type: 'COACH_PACK_CACHED', ok: false, coach, error: 'Coach download failed.' })),
  )
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

  if (url.pathname.startsWith('/audio/coaches/') && url.pathname.endsWith('.mp3')) {
    event.respondWith(
      caches.open(COACH_AUDIO_CACHE).then((cache) => cache.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (!response.ok || response.type !== 'basic') return response
        cache.put(request, response.clone())
        return response
      }))),
    )
    return
  }

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
