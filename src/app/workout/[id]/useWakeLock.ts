'use client'

import { useEffect, useRef } from 'react'
import { createWakeLockController, WakeLockApiLike, WakeLockController } from '@/lib/wakeLockCore'

// Thin DOM adapter over the pure wakeLockCore lifecycle (ADR-0007). Keeps the
// screen awake while `active` — since ADR-0007 this is held at the
// WorkoutLogger top level for the whole non-completed session, not per-timer,
// so DruhTimer/ExerciseGuide no longer call this themselves. Re-acquires on
// tab re-focus, since the browser drops the lock when the page is hidden; the
// acquire/release/re-acquire decision logic itself lives in wakeLockCore.ts
// so it's testable without a DOM (see .claude/test_wake-lock.mjs).
//
// One controller instance for the component's whole lifetime (not recreated
// per `active` toggle) — otherwise a hidden->visible re-request racing an
// active->false->true flip would be split across controllers that don't know
// about each other's in-flight requests.
export function useWakeLock(active: boolean) {
  const controllerRef = useRef<WakeLockController | null>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (navigator as any).wakeLock as WakeLockApiLike
    const controller = createWakeLockController({ wakeLock: api })
    controllerRef.current = controller

    const onVisibility = () => {
      controller.onVisibilityChange(document.visibilityState === 'visible' ? 'visible' : 'hidden')
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      controller.teardown()
      controllerRef.current = null
    }
  }, [])

  useEffect(() => {
    controllerRef.current?.setActive(active)
  }, [active])
}
