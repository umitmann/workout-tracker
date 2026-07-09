'use client'

import { useEffect } from 'react'

// Keeps the screen awake while `active` (e.g. during a guided set / rest timer)
// so the phone doesn't sleep mid-exercise. Re-acquires on tab re-focus, since
// the browser drops the lock when the page is hidden.
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    let sentinel: { release: () => Promise<void> } | null = null
    let released = false

    const acquire = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sentinel = await (navigator as any).wakeLock.request('screen')
      } catch {
        /* denied / not visible — ignore */
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !released) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibility)
      sentinel?.release().catch(() => {})
    }
  }, [active])
}
