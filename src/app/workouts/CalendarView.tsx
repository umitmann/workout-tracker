'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, useEffect, useRef } from 'react'
import { WorkoutCalendarEntry, RoutineWithExercises } from '@/lib/dal'
import { fetchUserTemplates } from '@/app/actions/templates'
import { scheduleWorkout, logWorkoutForDate, startPlannedWorkout, deleteWorkoutSoft, fetchWorkoutPreview, fetchMonthWorkoutsWithPreviews, WorkoutPreviewExercise } from '@/app/actions/workouts'
import { useWorkoutClipboard } from '@/lib/WorkoutClipboardContext'
import { useSwipe } from '@/lib/useSwipe'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type DaySheet = {
  date: string
  isPast: boolean
  isFuture: boolean
  workouts: WorkoutCalendarEntry[]
}

function monthKey(y: number, m: number) {
  return `${y}-${String(m).padStart(2, '0')}`
}

function statusDotColor(status: WorkoutCalendarEntry['status']) {
  if (status === 'completed') return 'bg-emerald-500'
  if (status === 'in_progress') return 'bg-orange-400'
  return 'bg-zinc-400 dark:bg-zinc-600'
}

export default function CalendarView({
  year: initialYear,
  month: initialMonth,
  workouts: initialWorkouts,
  initialPreviews,
  initialTemplates,
}: {
  year: number
  month: number
  workouts: WorkoutCalendarEntry[]
  initialPreviews?: Record<number, WorkoutPreviewExercise[]>
  basePath?: string
  initialTemplates?: RoutineWithExercises[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { copy: copyToClipboard } = useWorkoutClipboard()

  // Month cache — keyed by "YYYY-MM", seeded with the server-rendered month
  const monthCache = useRef<Map<string, WorkoutCalendarEntry[]>>(
    new Map([[monthKey(initialYear, initialMonth), initialWorkouts]])
  )

  // Preview cache — keyed by workout id, seeded from SSR data
  const previewCache = useRef<Map<number, WorkoutPreviewExercise[]>>(
    new Map(Object.entries(initialPreviews ?? {}).map(([k, v]) => [Number(k), v]))
  )

  // View state — all navigation stays in client state, no router.push
  const [viewYear, setViewYear] = useState(initialYear)
  const [viewMonth, setViewMonth] = useState(initialMonth)
  const [viewWorkouts, setViewWorkouts] = useState<WorkoutCalendarEntry[]>(initialWorkouts)
  const [loadingMonth, setLoadingMonth] = useState(false)

  const [sheet, setSheet] = useState<DaySheet | null>(null)
  const [templates, setTemplates] = useState<RoutineWithExercises[] | null>(initialTemplates ?? null)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined)
  const [workoutPreviews, setWorkoutPreviews] = useState<Map<number, WorkoutPreviewExercise[]>>(new Map())
  const [loadingPreviews, setLoadingPreviews] = useState(false)
  const [addingWorkout, setAddingWorkout] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // ── Calendar grid helpers ──────────────────────────────────────────────────

  const firstDow = new Date(viewYear, viewMonth - 1, 1).getDay()
  const startOffset = (firstDow + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7
  const today = new Date().toISOString().split('T')[0]

  const workoutsByDate = new Map<string, WorkoutCalendarEntry[]>()
  for (const w of viewWorkouts) {
    if (!workoutsByDate.has(w.date)) workoutsByDate.set(w.date, [])
    workoutsByDate.get(w.date)!.push(w)
  }

  // ── Prefetch adjacent months silently ─────────────────────────────────────

  useEffect(() => {
    for (const delta of [-2, -1, 1, 2]) {
      const d = new Date(viewYear, viewMonth - 1 + delta, 1)
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      const key = monthKey(y, m)
      if (!monthCache.current.has(key)) {
        fetchMonthWorkoutsWithPreviews(y, m).then(({ entries, previews }) => {
          monthCache.current.set(key, entries)
          for (const [id, p] of Object.entries(previews)) {
            previewCache.current.set(Number(id), p)
          }
        })
      }
    }
  }, [viewYear, viewMonth])

  // ── Navigation ─────────────────────────────────────────────────────────────

  async function navMonth(delta: number) {
    const d = new Date(viewYear, viewMonth - 1 + delta, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const key = monthKey(y, m)

    if (monthCache.current.has(key)) {
      setViewYear(y)
      setViewMonth(m)
      setViewWorkouts(monthCache.current.get(key)!)
    } else {
      setLoadingMonth(true)
      const { entries, previews } = await fetchMonthWorkoutsWithPreviews(y, m)
      monthCache.current.set(key, entries)
      for (const [id, p] of Object.entries(previews)) {
        previewCache.current.set(Number(id), p)
      }
      setViewYear(y)
      setViewMonth(m)
      setViewWorkouts(entries)
      setLoadingMonth(false)
    }
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => navMonth(1),
    onSwipeRight: () => navMonth(-1),
  })

  // ── Day sheet ──────────────────────────────────────────────────────────────

  function openSheet(dayNum: number) {
    const d = String(dayNum).padStart(2, '0')
    const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${d}`
    const dayWorkouts = workoutsByDate.get(dateStr) ?? []
    const isFuture = dateStr > today
    const isPast = dateStr < today

    setSelectedTemplateId(undefined)
    setWorkoutPreviews(new Map())
    setCopiedId(null)
    setAddingWorkout(false)
    setSheet({ date: dateStr, isPast, isFuture, workouts: dayWorkouts })

    if (templates === null) {
      setLoadingTemplates(true)
      fetchUserTemplates().then((data) => {
        setTemplates(data)
        setLoadingTemplates(false)
      })
    }

    // Seed from cache immediately — no spinner for workouts already prefetched
    const cached = new Map<number, WorkoutPreviewExercise[]>()
    for (const w of dayWorkouts) {
      if (previewCache.current.has(w.id)) cached.set(w.id, previewCache.current.get(w.id)!)
    }
    if (cached.size > 0) setWorkoutPreviews(cached)

    // Only fetch what's genuinely missing (e.g. a workout completed after last prefetch)
    const toFetch = dayWorkouts.filter((w) => w.status !== 'planned' && !previewCache.current.has(w.id))
    if (toFetch.length > 0) {
      setLoadingPreviews(true)
      Promise.all(
        toFetch.map((w) => fetchWorkoutPreview(w.id).then((data) => ({ id: w.id, data })))
      ).then((results) => {
        for (const r of results) previewCache.current.set(r.id, r.data)
        setWorkoutPreviews((prev) => {
          const next = new Map(prev)
          for (const r of results) next.set(r.id, r.data)
          return next
        })
        setLoadingPreviews(false)
      })
    }
  }

  function closeSheet() {
    setSheet(null)
    setAddingWorkout(false)
  }

  function handlePopupCopy(workout: WorkoutCalendarEntry) {
    const preview = workoutPreviews.get(workout.id)
    if (!preview) return
    copyToClipboard({
      entries: preview.map((ex) => ({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        setCount: ex.setCount,
        reps: ex.firstSetReps,
        weight: ex.firstSetWeight,
      })),
      sourceDate: workout.date,
    })
    setCopiedId(workout.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function handleAddWorkout() {
    if (!sheet) return
    if (selectedTemplateId) {
      router.push(`/workouts/${selectedTemplateId}?date=${sheet.date}`)
      closeSheet()
    } else if (sheet.isFuture) {
      startTransition(async () => {
        await scheduleWorkout(sheet.date)
        // Refresh month cache after scheduling so the new dot appears
        const { entries: fresh, previews } = await fetchMonthWorkoutsWithPreviews(viewYear, viewMonth)
        monthCache.current.set(monthKey(viewYear, viewMonth), fresh)
        for (const [id, p] of Object.entries(previews)) {
          previewCache.current.set(Number(id), p)
        }
        setViewWorkouts(fresh)
        closeSheet()
      })
    } else {
      startTransition(async () => {
        await logWorkoutForDate(sheet.date)
        closeSheet()
      })
    }
  }

  function handleStartPlanned(workout: WorkoutCalendarEntry) {
    if (workout.template_id) {
      router.push(`/workouts/${workout.template_id}?workoutId=${workout.id}`)
      closeSheet()
    } else {
      startTransition(async () => {
        await startPlannedWorkout(workout.id)
      })
    }
  }

  async function handleDeleteWorkout(workoutId: number) {
    setDeletingId(workoutId)
    await deleteWorkoutSoft(workoutId)
    setDeletingId(null)
    previewCache.current.delete(workoutId)
    const updated = viewWorkouts.filter((w) => w.id !== workoutId)
    setViewWorkouts(updated)
    monthCache.current.set(monthKey(viewYear, viewMonth), updated)
    setSheet((prev) => {
      if (!prev) return null
      return { ...prev, workouts: prev.workouts.filter((w) => w.id !== workoutId) }
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4 px-2">
        <button
          onClick={() => navMonth(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-400"
        >
          ‹
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">
            {MONTH_NAMES[viewMonth - 1]} {viewYear}
          </span>
          {loadingMonth && (
            <div className="w-3 h-3 rounded-full border-2 border-zinc-300 border-t-orange-500 animate-spin" />
          )}
        </div>
        <button
          onClick={() => navMonth(1)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-400"
        >
          ›
        </button>
      </div>

      {/* Swipeable calendar area */}
      <div {...swipeHandlers} className="touch-pan-y select-none">
        {/* Day name headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-zinc-400 dark:text-zinc-600 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-y-1">
          {Array.from({ length: totalCells }, (_, i) => {
            const dayNum = i - startOffset + 1
            if (dayNum < 1 || dayNum > daysInMonth) {
              return <div key={i} />
            }
            const d = String(dayNum).padStart(2, '0')
            const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${d}`
            const dayWorkouts = workoutsByDate.get(dateStr) ?? []
            const isToday = dateStr === today

            return (
              <button
                key={i}
                onClick={() => openSheet(dayNum)}
                className={`relative flex flex-col items-center py-2 rounded-xl transition-colors hover:bg-orange-50 dark:hover:bg-zinc-900 ${
                  isToday ? 'ring-2 ring-orange-500 ring-offset-1 dark:ring-offset-black' : ''
                }`}
              >
                <span className={`text-sm font-bold ${
                  isToday ? 'text-orange-500' : 'text-zinc-700 dark:text-zinc-300'
                }`}>
                  {dayNum}
                </span>
                {dayWorkouts.length > 0 && (
                  <div className="flex gap-0.5 mt-1">
                    {dayWorkouts.slice(0, 4).map((w) => (
                      <span
                        key={w.id}
                        className={`w-1.5 h-1.5 rounded-full ${statusDotColor(w.status)}`}
                      />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-5 px-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs text-zinc-400 dark:text-zinc-600">Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-xs text-zinc-400 dark:text-zinc-600">In progress</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-600" />
          <span className="text-xs text-zinc-400 dark:text-zinc-600">Planned</span>
        </div>
      </div>

      {/* Day sheet */}
      {sheet && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
          onClick={closeSheet}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl flex flex-col max-h-[85vh] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-orange-500">
                  {sheet.isFuture ? 'Future' : sheet.date === today ? 'Today' : 'Past'}
                </p>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                  {new Date(sheet.date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })}
                </h2>
              </div>
              <button
                onClick={closeSheet}
                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">

              {/* One card per workout */}
              {sheet.workouts.map((workout, idx) => {
                const preview = workoutPreviews.get(workout.id)
                const isDeleting = deletingId === workout.id

                return (
                  <div key={workout.id}>
                    {/* Card label row */}
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                        {sheet.workouts.length > 1 ? `Workout ${idx + 1} · ` : ''}
                        {workout.status === 'completed' ? 'Completed' : workout.status === 'in_progress' ? 'In progress' : 'Planned'}
                      </p>
                      {workout.status !== 'planned' && preview && preview.length > 0 && (
                        <button
                          onClick={() => handlePopupCopy(workout)}
                          title="Copy workout"
                          className={`w-7 h-7 flex items-center justify-center rounded-full border transition-colors ${
                            copiedId === workout.id
                              ? 'border-orange-400 text-orange-500'
                              : 'border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500'
                          }`}
                        >
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="5" y="1" width="9" height="11" rx="1.5" />
                            <path d="M2 4v10a1.5 1.5 0 0 0 1.5 1.5H11" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Planned */}
                    {workout.status === 'planned' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStartPlanned(workout)}
                          disabled={isPending || isDeleting}
                          className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 py-3 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-40 transition-colors"
                        >
                          {isPending ? '…' : 'Start now'}
                        </button>
                        <button
                          onClick={() => handleDeleteWorkout(workout.id)}
                          disabled={isDeleting || isPending}
                          className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-3 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-40"
                        >
                          {isDeleting ? '…' : 'Remove'}
                        </button>
                      </div>
                    )}

                    {/* In-progress / completed */}
                    {workout.status !== 'planned' && (
                      <>
                        {loadingPreviews && preview === undefined && (
                          <div className="flex justify-center py-3">
                            <div className="w-5 h-5 rounded-full border-2 border-zinc-300 border-t-orange-500 animate-spin" />
                          </div>
                        )}
                        {preview !== undefined && (
                          preview.length === 0
                            ? <p className="text-sm text-zinc-400 dark:text-zinc-600 mb-3">No sets logged.</p>
                            : <ul className="flex flex-col gap-1 mb-3">
                                {preview.map((ex) => (
                                  <li key={ex.exerciseId} className="flex items-center justify-between text-sm">
                                    <span className="font-medium text-zinc-900 dark:text-white truncate">{ex.exerciseName}</span>
                                    <span className="text-xs text-zinc-400 dark:text-zinc-600 shrink-0 ml-2">
                                      {ex.setCount} set{ex.setCount !== 1 ? 's' : ''}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                        )}
                        <div className="flex gap-2">
                          <a
                            href={`/workout/${workout.id}`}
                            className="flex-1 text-center rounded-xl bg-orange-500 hover:bg-orange-600 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors"
                          >
                            {workout.status === 'completed' ? 'View workout' : 'Continue'}
                          </a>
                          <button
                            onClick={() => handleDeleteWorkout(workout.id)}
                            disabled={isDeleting || isPending}
                            className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-3 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-40"
                          >
                            {isDeleting ? '…' : 'Delete'}
                          </button>
                        </div>
                      </>
                    )}

                    {idx < sheet.workouts.length - 1 && (
                      <div className="border-t border-zinc-100 dark:border-zinc-800 mt-4" />
                    )}
                  </div>
                )
              })}

              {/* Add workout section */}
              {(addingWorkout || sheet.workouts.length === 0) ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                    {sheet.workouts.length > 0
                      ? (sheet.isFuture ? 'Schedule another' : 'Add another workout')
                      : (sheet.isFuture ? 'Schedule a workout' : 'Log a workout')}
                  </p>

                  {loadingTemplates ? (
                    <div className="flex justify-center py-4">
                      <div className="w-6 h-6 rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white animate-spin" />
                    </div>
                  ) : (
                    <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                      <li>
                        <button
                          onClick={() => setSelectedTemplateId(undefined)}
                          className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                            selectedTemplateId === undefined
                              ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                          }`}
                        >
                          No template (blank)
                        </button>
                      </li>
                      {(templates ?? []).map((t) => (
                        <li key={t.id}>
                          <button
                            onClick={() => setSelectedTemplateId(String(t.id))}
                            className={`w-full text-left px-4 py-3 transition-colors ${
                              selectedTemplateId === String(t.id)
                                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <p className={`text-sm font-medium ${
                              selectedTemplateId === String(t.id)
                                ? 'text-white dark:text-zinc-900'
                                : 'text-zinc-900 dark:text-white'
                            }`}>{t.name}</p>
                            <p className={`text-xs mt-0.5 ${
                              selectedTemplateId === String(t.id)
                                ? 'text-zinc-300 dark:text-zinc-600'
                                : 'text-zinc-400 dark:text-zinc-600'
                            }`}>
                              {t.routine_exercises.length} exercise{t.routine_exercises.length !== 1 ? 's' : ''}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleAddWorkout}
                      disabled={isPending || loadingTemplates}
                      className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 py-3 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-40 transition-colors"
                    >
                      {isPending ? '…' : sheet.isFuture ? 'Schedule' : 'Start workout'}
                    </button>
                    {sheet.workouts.length > 0 && (
                      <button
                        onClick={() => { setAddingWorkout(false); setSelectedTemplateId(undefined) }}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingWorkout(true)}
                  className="w-full rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 py-3 text-sm font-bold text-zinc-400 dark:text-zinc-600 hover:border-orange-400 hover:text-orange-500 transition-colors"
                >
                  + Add another workout
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
