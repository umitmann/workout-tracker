'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { validateActiveWorkoutSession } from '@/app/actions/workouts'
import {
  ACTIVE_WORKOUT_EVENT,
  ACTIVE_WORKOUT_STORAGE_KEY,
  clearActiveWorkoutSession,
  normalizeActiveWorkoutSession,
  readActiveWorkoutSessionRaw,
  restClockSeconds,
  writeActiveWorkoutSession,
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

function isAccountAccessPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/forgot-password' || pathname.startsWith('/auth/')
}

export default function ActiveWorkoutDock() {
  const pathname = usePathname()
  const [, tick] = useState(0)
  const [resuming, setResuming] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [validatedWorkoutId, setValidatedWorkoutId] = useState<number | null>(null)
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
  const workoutId = session?.workoutId ?? null
  const loggerIsOpen = session != null && pathname === `/workout/${session.workoutId}`
  const hiddenForRoute = loggerIsOpen || isAccountAccessPath(pathname)

  // Purge pre-v2/corrupt values instead of reconsidering them after every
  // login. Version 2 requires a real set summary and is independently checked
  // against the authenticated database row below.
  useEffect(() => {
    if (rawSession && !session) clearActiveWorkoutSession()
  }, [rawSession, session])

  // Local storage is never authoritative. Validate only when the floating
  // frame could become visible, not on every set update while the logger is
  // open. getWorkoutWithSets scopes the lookup to the authenticated owner.
  useEffect(() => {
    if (workoutId == null || hiddenForRoute) return
    let cancelled = false
    validateActiveWorkoutSession(workoutId)
      .then((valid) => {
        if (cancelled) return
        if (!valid) {
          setValidatedWorkoutId(null)
          clearActiveWorkoutSession(workoutId)
          return
        }
        setValidatedWorkoutId(workoutId)
      })
      .catch(() => {
        if (!cancelled) setValidatedWorkoutId(null)
      })
    return () => { cancelled = true }
  }, [hiddenForRoute, workoutId])

  useEffect(() => {
    if (!session?.rest) return
    const timer = window.setInterval(() => tick((value) => value + 1), 1_000)
    return () => window.clearInterval(timer)
  }, [session?.rest])

  if (!session || hiddenForRoute || validatedWorkoutId !== session.workoutId) return null

  const { rest, summary } = session
  const progress = Math.round((summary.completedSets / summary.totalSets) * 100)

  function adjustRest(deltaSeconds: number) {
    if (!session?.rest) return
    writeActiveWorkoutSession({
      ...session,
      updatedAt: Date.now(),
      rest: {
        ...session.rest,
        target: Math.max(0, session.rest.target + deltaSeconds),
      },
    })
  }

  function skipRest() {
    if (!session) return
    writeActiveWorkoutSession({ ...session, updatedAt: Date.now(), rest: null })
  }

  if (collapsed) {
    return (
      <aside
        aria-label="Active workout"
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-[55] flex max-w-[calc(100vw-1.5rem)] items-center gap-1 rounded-full border border-orange-400 bg-zinc-950 p-1.5 text-white shadow-2xl shadow-black/30 md:bottom-5 md:right-5"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand minimized workout"
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-full px-3 text-left hover:bg-white/10"
        >
          <span className="size-2.5 shrink-0 rounded-full bg-orange-500" aria-hidden="true" />
          <span className="truncate text-sm font-bold">
            {rest ? `Rest ${clock(restClockSeconds(rest))}` : summary.exerciseName}
          </span>
        </button>
        <Link
          href={`/workout/${session.workoutId}`}
          prefetch={true}
          onClick={() => setResuming(true)}
          aria-label="Resume workout"
          aria-busy={resuming}
          className="grid min-h-11 min-w-11 place-items-center rounded-full bg-orange-600 text-lg font-black hover:bg-orange-500"
        >
          {resuming ? '…' : '↗'}
        </Link>
      </aside>
    )
  }

  return (
    <aside
      aria-label="Active workout"
      className="active-workout-frame fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-[55] w-[calc(100%-1.5rem)] max-w-sm overflow-hidden rounded-[1.4rem] border border-orange-400/80 bg-zinc-950 text-white shadow-2xl shadow-black/40 md:bottom-5 md:right-5"
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <span className="size-2.5 shrink-0 rounded-full bg-orange-500 shadow-[0_0_0_4px_rgba(249,115,22,0.14)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-orange-300">Saved workout</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse minimized workout"
          className="grid min-h-11 min-w-11 place-items-center rounded-xl text-xl font-bold text-zinc-300 hover:bg-white/10 hover:text-white"
        >
          −
        </button>
      </div>

      <div className="p-4 pt-3">
        <div className="active-workout-main flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black">{summary.exerciseName}</p>
            <p className="mt-0.5 text-sm font-semibold text-zinc-300">
              {summary.allSetsComplete
                ? 'All sets complete'
                : `Set ${summary.setNumber} of ${summary.exerciseSetCount}`}
              {summary.prescription ? ` · ${summary.prescription}` : ''}
            </p>
          </div>
          <Link
            href={`/workout/${session.workoutId}`}
            prefetch={true}
            onClick={() => setResuming(true)}
            aria-busy={resuming}
            className="active-workout-resume inline-flex min-h-11 shrink-0 items-center rounded-xl bg-white px-4 text-sm font-black text-zinc-950 hover:bg-orange-50"
          >
            {resuming ? 'Loading…' : 'Resume'}
          </Link>
        </div>

        <div className="mt-3" aria-label={`${summary.completedSets} of ${summary.totalSets} sets complete`}>
          <div className="flex items-center justify-between text-[0.68rem] font-bold text-zinc-400">
            <span>Workout progress</span>
            <span>{summary.completedSets}/{summary.totalSets}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-orange-500 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {rest && (
          <div className="active-workout-mini-rest mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-1.5 rounded-xl bg-white/8 p-1.5">
            <span className="active-workout-mini-clock min-w-0 px-2">
              <span className="block text-[0.62rem] font-bold uppercase tracking-wider text-orange-300">Rest</span>
              <span className="block font-mono text-lg font-black tabular-nums">{clock(restClockSeconds(rest))}</span>
            </span>
            <button type="button" onClick={() => adjustRest(-15)} aria-label="Remove 15 seconds from rest" className="min-h-11 min-w-11 rounded-lg border border-white/15 text-xs font-black hover:bg-white/10">−15</button>
            <button type="button" onClick={() => adjustRest(15)} aria-label="Add 15 seconds to rest" className="min-h-11 min-w-11 rounded-lg border border-white/15 text-xs font-black hover:bg-white/10">+15</button>
            <button type="button" onClick={skipRest} aria-label="Skip rest" className="active-workout-mini-skip min-h-11 rounded-lg px-2 text-xs font-black text-orange-300 hover:bg-white/10">Skip</button>
          </div>
        )}
      </div>
    </aside>
  )
}
