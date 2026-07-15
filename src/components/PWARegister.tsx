'use client'

import { useEffect, useState } from 'react'

export default function PWARegister() {
  // Start online to avoid false alarms from browsers that briefly report an
  // indeterminate connection during hydration. Real connection changes emit
  // online/offline events; an already-offline launch reaches /offline via SW.
  const [offline, setOffline] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    const wentOnline = () => setOffline(false)
    const wentOffline = () => setOffline(true)
    window.addEventListener('online', wentOnline)
    window.addEventListener('offline', wentOffline)

    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator && (window.isSecureContext || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((registration) => {
          if (registration.waiting) setWaitingWorker(registration.waiting)
          registration.addEventListener('updatefound', () => {
            const installing = registration.installing
            installing?.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) setWaitingWorker(installing)
            })
          })
        })
        .catch(() => {
          // Installation is progressive enhancement; the web app remains usable.
        })
    }

    return () => {
      window.removeEventListener('online', wentOnline)
      window.removeEventListener('offline', wentOffline)
    }
  }, [])

  useEffect(() => {
    if (!waitingWorker) return
    const reload = () => location.reload()
    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true })
    return () => navigator.serviceWorker.removeEventListener('controllerchange', reload)
  }, [waitingWorker])

  if (!offline && !waitingWorker) return null

  return (
    <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-lg items-center justify-between gap-3 rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white shadow-2xl" role="status">
      <p className="text-sm font-semibold">{offline ? 'Offline — reconnect before saving workout data.' : 'A new app version is ready.'}</p>
      {waitingWorker && !offline && (
        <button type="button" onClick={() => waitingWorker.postMessage({ type: 'SKIP_WAITING' })} className="shrink-0 rounded-lg bg-orange-500 px-3 py-2 text-xs font-black uppercase tracking-wide">Update</button>
      )}
    </div>
  )
}
