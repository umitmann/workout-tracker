'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { WorkoutCalendarEntry, RoutineWithExercises } from '@/lib/dal'
import { fetchUserTemplates } from '@/app/actions/templates'
import { scheduleWorkout, logWorkoutForDate, startPlannedWorkout, deleteWorkout, fetchWorkoutPreview, WorkoutPreviewExercise } from '@/app/actions/workouts'
import { useWorkoutClipboard } from '@/lib/WorkoutClipboardContext'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type DaySheet = {
  date: string        // YYYY-MM-DD
  isPast: boolean
  isFuture: boolean
  workout: WorkoutCalendarEntry | null
}

export default function CalendarView({
  year,
  month,
  workouts,
  basePath = '/workouts',
  initialTemplates,
}: {
  year: number
  month: number
  workouts: WorkoutCalendarEntry[]
  basePath?: string
  initialTemplates?: RoutineWithExercises[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { copy: copyToClipboard } = useWorkoutClipboard()
  const [popupCopied, setPopupCopied] = useState(false)

  const [sheet, setSheet] = useState<DaySheet | null>(null)
  const [templates, setTemplates] = useState<RoutineWithExercises[] | null>(initialTemplates ?? null)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined)
  const [workoutPreview, setWorkoutPreview] = useState<WorkoutPreviewExercise[] | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // ── Calendar grid helpers ──────────────────────────────────────────────────

  const firstDow = new Date(year, month - 1, 1).getDay() // 0=Sun
  // Convert Sunday-first to Monday-first offset
  const startOffset = (firstDow + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7

  const today = new Date().toISOString().split('T')[0]

  const workoutByDate = new Map(workouts.map((w) => [w.date, w]))

  function navMonth(delta: number) {
    let y = year
    let m = month + delta
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    router.push(`${basePath}?y=${y}&m=${m}`)
  }

  function openSheet(dayNum: number) {
    const d = String(dayNum).padStart(2, '0')
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${d}`
    const workout = workoutByDate.get(dateStr) ?? null
    const isFuture = dateStr > today
    const isPast = dateStr < today

    setSelectedTemplateId(undefined)
    setWorkoutPreview(null)
    setPopupCopied(false)
    setSheet({ date: dateStr, isPast, isFuture, workout })

    if (templates === null) {
      setLoadingTemplates(true)
      fetchUserTemplates().then((data) => {
        setTemplates(data)
        setLoadingTemplates(false)
      })
    }

    if (workout && workout.status !== 'planned') {
      setLoadingPreview(true)
      fetchWorkoutPreview(workout.id).then((data) => {
        setWorkoutPreview(data)
        setLoadingPreview(false)
      })
    }
  }

  function closeSheet() {
    setSheet(null)
  }

  function handlePopupCopy(date: string) {
    if (!workoutPreview) return
    copyToClipboard({
      entries: workoutPreview.map((ex) => ({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        setCount: ex.setCount,
        reps: ex.firstSetReps,
        weight: ex.firstSetWeight,
      })),
      sourceDate: date,
    })
    setPopupCopied(true)
    setTimeout(() => setPopupCopied(false), 2000)
  }

  function handleSchedule() {
    if (!sheet) return
    if (selectedTemplateId) {
      // Route through template editor so user can set weights before starting/scheduling
      router.push(`/workouts/${selectedTemplateId}?date=${sheet.date}`)
      closeSheet()
    } else if (sheet.isFuture) {
      startTransition(async () => {
        await scheduleWorkout(sheet.date)
        router.refresh()
        closeSheet()
      })
    } else {
      startTransition(async () => {
        await logWorkoutForDate(sheet.date)
        closeSheet()
      })
    }
  }

  function handleStartPlanned() {
    if (!sheet?.workout) return
    if (sheet.workout.template_id) {
      // Route through template editor so user can set weights before starting
      router.push(`/workouts/${sheet.workout.template_id}?workoutId=${sheet.workout.id}`)
      closeSheet()
    } else {
      startTransition(async () => {
        await startPlannedWorkout(sheet.workout!.id)
      })
    }
  }

  function handleRemovePlanned() {
    if (!sheet?.workout) return
    startTransition(async () => {
      await deleteWorkout(sheet.workout!.id)
      router.refresh()
      closeSheet()
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
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            onClick={() => navMonth(1)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-400"
          >
            ›
          </button>
        </div>

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
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${d}`
            const workout = workoutByDate.get(dateStr)
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
                  isToday
                    ? 'text-orange-500'
                    : 'text-zinc-700 dark:text-zinc-300'
                }`}>
                  {dayNum}
                </span>
                {workout && (
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full ${
                    workout.status === 'completed'
                      ? 'bg-emerald-500'
                      : workout.status === 'in_progress'
                        ? 'bg-orange-400'
                        : 'bg-zinc-400 dark:bg-zinc-600'
                  }`} />
                )}
              </button>
            )
          })}
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
                  {sheet.isFuture ? 'Future' : sheet.date === new Date().toISOString().split('T')[0] ? 'Today' : 'Past'}
                </p>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                  {new Date(sheet.date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {sheet.workout && sheet.workout.status !== 'planned' && workoutPreview && workoutPreview.length > 0 && (
                  <button
                    onClick={() => handlePopupCopy(sheet.date)}
                    title="Copy workout"
                    className={`w-7 h-7 flex items-center justify-center rounded-full border transition-colors ${
                      popupCopied
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
                <button
                  onClick={closeSheet}
                  className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors text-lg leading-none"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">

              {/* Existing planned workout */}
              {sheet.workout?.status === 'planned' && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Planned workout</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleStartPlanned}
                      disabled={isPending}
                      className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 py-3 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-40 transition-colors"
                    >
                      {isPending ? '…' : 'Start now'}
                    </button>
                    <button
                      onClick={handleRemovePlanned}
                      disabled={isPending}
                      className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-3 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {/* In-progress or completed — navigate to logger */}
              {sheet.workout && sheet.workout.status !== 'planned' && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                    {sheet.workout.status === 'completed' ? 'Completed' : 'In progress'}
                  </p>

                  {/* Exercise overview */}
                  {loadingPreview && (
                    <div className="flex justify-center py-3">
                      <div className="w-5 h-5 rounded-full border-2 border-zinc-300 border-t-orange-500 animate-spin" />
                    </div>
                  )}
                  {!loadingPreview && workoutPreview !== null && (
                    workoutPreview.length === 0
                      ? <p className="text-sm text-zinc-400 dark:text-zinc-600">No sets logged.</p>
                      : <ul className="flex flex-col gap-1">
                          {workoutPreview.map((ex) => (
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
                      href={`/workout/${sheet.workout.id}`}
                      className="flex-1 text-center rounded-xl bg-orange-500 hover:bg-orange-600 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors"
                    >
                      {sheet.workout.status === 'completed' ? 'View workout' : 'Continue'}
                    </a>
                    <button
                      onClick={handleRemovePlanned}
                      disabled={isPending}
                      className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-3 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {/* No workout — schedule or log */}
              {!sheet.workout && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                    {sheet.isFuture ? 'Schedule a workout' : 'Log a workout'}
                  </p>

                  {/* Template picker */}
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

                  <button
                    onClick={handleSchedule}
                    disabled={isPending || loadingTemplates}
                    className="w-full rounded-xl bg-orange-500 hover:bg-orange-600 py-3 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-40 transition-colors"
                  >
                    {isPending ? '…' : sheet.isFuture ? 'Schedule' : 'Start workout'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
