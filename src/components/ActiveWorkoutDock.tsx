'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  ACTIVE_WORKOUT_EVENT,
  ACTIVE_WORKOUT_STORAGE_KEY,
  normalizeActiveWorkoutSession,
  readActiveWorkoutSessionRaw,
  restClockSeconds,
} from '@/lib/activeWorkoutSession'

function clock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

function subscribeActiveWorkout(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === ACTIVE_WORKOUT_STORAGE_KEY) onStoreChange()
  }
  window.addEventListener(ACTIVE_WORKOUT_EVENT, onStoreChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(ACTIVE_WORKOUT_EVENT, onStoreChange)
    window.removeEventListener('storage', onStorage)
  }
}

export default function ActiveWorkoutDock() {
  const pathname = usePathname()
  const [, tick] = useState(0)
  const [resuming, setResuming] = useState(false)
  const rawSession = useSyncExternalStore(
    subscribeActiveWorkout,
    readActiveWorkoutSessionRaw,
    () => null,
  )
  const session = useMemo(() => {
    try {
      return normalizeActiveWorkoutSession(JSON.parse(rawSession ?? 'null'))
    } catch {
      return null
    }
  }, [rawSession])

  useEffect(() => {
    if (!session?.rest) return
    const timer = window.setInterval(() => tick((value) => value + 1), 1_000)
    return () => window.clearInterval(timer)
  }, [session?.rest])

  if (!session || pathname === `/workout/${session.workoutId}`) return null

  const rest = session.rest
  return (
    <aside
      aria-label="Active workout"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[55] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-orange-300 bg-zinc-950 px-4 py-3 text-white shadow-2xl shadow-black/30 dark:border-orange-700 md:inset-x-auto md:bottom-5 md:right-5 md:w-96"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-600 text-lg" aria-hidden="true">↗</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.65rem] font-black uppercase tracking-[0.18em] text-orange-400">Saved workout</span>
        <span className="block truncate text-sm font-bold">
          {rest ? `${rest.mode === 'fixed' ? 'Rest' : 'Resting'} · ${clock(restClockSeconds(rest))}` : 'Workout in progress'}
        </span>
      </span>
      <a
        href={`/workout/${session.workoutId}`}
        onClick={() => setResuming(true)}
        aria-busy={resuming}
        className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-white px-4 text-sm font-black text-zinc-950 hover:bg-orange-50"
      >
        {resuming ? 'Loading…' : 'Resume'}
      </a>
    </aside>
  )
}
