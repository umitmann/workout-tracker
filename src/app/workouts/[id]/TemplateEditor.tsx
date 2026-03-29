'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTemplate, saveTemplateExercises, deleteTemplate, TemplateExercisePayload } from '@/app/actions/templates'
import { startWorkoutFromTemplate, startPlannedWorkout, scheduleWorkout } from '@/app/actions/workouts'
import { fetchExerciseDetails, fetchLastExercisePerformance, fetchBestExercisePerformance, fetchBestExercisePerformance60Days } from '@/app/actions/exercises'
import { LastExercisePerformance, RoutineWithExercises } from '@/lib/dal'
import ExercisePickerSheet, { SlimExercise } from '@/app/workout/[id]/ExercisePickerSheet'
import ExerciseInfoModal from '@/app/workout/[id]/ExerciseInfoModal'
import LastPerfModal from '@/app/workout/[id]/LastPerfModal'
import { useWorkoutClipboard } from '@/lib/WorkoutClipboardContext'

type TemplateExercise = {
  localId: string
  exerciseId: number
  exerciseName: string
  exerciseCategory: string | null
  sets: number
  reps: number
  weight: number | null
}

type ExerciseDetails = {
  id: number
  name: string
  category: string | null
  equipment: string | null
  muscles: string[] | null
  muscles_secondary: string[] | null
  images: string[] | null
  instructions: string[] | null
}

export default function TemplateEditor({
  exercises,
  template,
  date,
  workoutId,
}: {
  exercises: SlimExercise[]
  template?: RoutineWithExercises
  date?: string
  workoutId?: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { clipboard, copy: copyToClipboard } = useWorkoutClipboard()
  const [copied, setCopied] = useState(false)
  const [showPasteConfirm, setShowPasteConfirm] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const isScheduling = !!date && date > today

  const [name, setName] = useState(template?.name ?? '')
  const [items, setItems] = useState<TemplateExercise[]>(
    () =>
      template?.routine_exercises
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((e) => ({
          localId: crypto.randomUUID(),
          exerciseId: e.exercise_id,
          exerciseName: e.exercises?.name ?? String(e.exercise_id),
          exerciseCategory: e.exercises?.category ?? null,
          sets: e.sets ?? 3,
          reps: e.reps ?? 10,
          weight: e.weight,
        })) ?? [],
  )

  const [showPicker, setShowPicker] = useState(false)
  const [infoExercise, setInfoExercise] = useState<ExerciseDetails | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  type PerfMode = 'last' | 'best' | 'best60'
  const PERF_TITLE: Record<PerfMode, string> = { last: 'Last session', best: 'Best session', best60: 'Best · 60 days' }
  const [perfModal, setPerfModal] = useState<{ id: number; name: string; mode: PerfMode } | null>(null)
  const [perfData, setPerfData] = useState<LastExercisePerformance | null>(null)
  const [perfLoading, setPerfLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleAddExercise(ex: SlimExercise) {
    setItems((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        exerciseId: ex.id,
        exerciseName: ex.name,
        exerciseCategory: ex.category,
        sets: 3,
        reps: 10,
        weight: null,
      },
    ])
    setShowPicker(false)
  }

  function handleRemove(localId: string) {
    setItems((prev) => prev.filter((i) => i.localId !== localId))
  }

  function updateItem(localId: string, patch: Partial<Pick<TemplateExercise, 'sets' | 'reps' | 'weight'>>) {
    setItems((prev) => prev.map((i) => (i.localId === localId ? { ...i, ...patch } : i)))
  }

  async function handleInfoClick(exerciseId: number) {
    setInfoLoading(true)
    const details = await fetchExerciseDetails(exerciseId)
    setInfoLoading(false)
    if (details) setInfoExercise(details as ExerciseDetails)
  }

  async function handlePerfClick(exerciseId: number, exerciseName: string, mode: PerfMode) {
    setPerfModal({ id: exerciseId, name: exerciseName, mode })
    setPerfData(null)
    setPerfLoading(true)
    let data: LastExercisePerformance | null = null
    if (mode === 'last') data = await fetchLastExercisePerformance(exerciseId)
    else if (mode === 'best') data = await fetchBestExercisePerformance(exerciseId)
    else data = await fetchBestExercisePerformance60Days(exerciseId)
    setPerfData(data)
    setPerfLoading(false)
  }

  function handleCopy() {
    copyToClipboard({
      entries: items.map((item) => ({
        exerciseId: item.exerciseId,
        exerciseName: item.exerciseName,
        setCount: item.sets,
        reps: item.reps,
        weight: item.weight,
      })),
      sourceDate: today,
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handlePasteRequest() {
    if (items.length > 0) {
      setShowPasteConfirm(true)
    } else {
      applyPaste()
    }
  }

  function applyPaste() {
    if (!clipboard) return
    setItems(
      clipboard.entries.map((entry) => ({
        localId: crypto.randomUUID(),
        exerciseId: entry.exerciseId,
        exerciseName: entry.exerciseName,
        exerciseCategory: null,
        sets: entry.setCount,
        reps: entry.reps ?? 0,
        weight: entry.weight,
      })),
    )
    setShowPasteConfirm(false)
  }

  function handleSave() {
    if (!name.trim()) { setError('Give your workout a name'); return }
    setError(null)

    const payload: TemplateExercisePayload[] = items.map((item, i) => ({
      exerciseId: item.exerciseId,
      sets: item.sets,
      reps: item.reps,
      weight: item.weight,
      order: i,
    }))

    startTransition(async () => {
      if (template) {
        const result = await saveTemplateExercises(template.id, name.trim(), payload)
        if ('error' in result) { setError(result.error ?? 'Save failed'); return }
      } else {
        const created = await createTemplate(name.trim())
        if ('error' in created) { setError(created.error ?? 'Create failed'); return }
        await saveTemplateExercises(created.id, name.trim(), payload)
      }
      router.push('/workouts')
    })
  }

  function handleStartNow() {
    if (!name.trim()) { setError('Give your workout a name'); return }
    setError(null)

    const payload: TemplateExercisePayload[] = items.map((item, i) => ({
      exerciseId: item.exerciseId,
      sets: item.sets,
      reps: item.reps,
      weight: item.weight,
      order: i,
    }))

    startTransition(async () => {
      let routineId: string | number
      if (template) {
        const result = await saveTemplateExercises(template.id, name.trim(), payload)
        if ('error' in result) { setError(result.error ?? 'Save failed'); return }
        routineId = template.id
      } else {
        const created = await createTemplate(name.trim())
        if ('error' in created) { setError(created.error ?? 'Create failed'); return }
        await saveTemplateExercises(created.id, name.trim(), payload)
        routineId = created.id
      }
      if (workoutId) {
        await startPlannedWorkout(workoutId)
      } else if (isScheduling) {
        const result = await scheduleWorkout(date!, String(routineId))
        if ('error' in result) { setError(result.error ?? 'Schedule failed'); return }
        router.push('/workouts')
      } else {
        await startWorkoutFromTemplate(routineId, date)
      }
    })
  }

  function handleDelete() {
    if (!template) return
    startTransition(async () => {
      await deleteTemplate(template.id)
    })
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => router.push('/workouts')}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          ← Workouts
        </button>
        <h1 className="text-sm font-medium text-zinc-900 dark:text-white">
          {template ? 'Edit template' : 'New template'}
        </h1>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={handleCopy}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
          {clipboard && (
            <button
              onClick={handlePasteRequest}
              className="rounded-full border border-orange-400 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors"
            >
              Paste
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isPending}
            className="rounded-full bg-zinc-800 dark:bg-zinc-700 hover:bg-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-40 transition-colors"
          >
            {isPending ? '…' : 'Save'}
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-6 flex flex-col gap-6">
        {/* Name */}
        <input
          type="text"
          placeholder="Workout name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm font-medium outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
        />

        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Exercise list */}
        {items.length === 0 && (
          <p className="text-sm text-zinc-400 dark:text-zinc-600">
            No exercises yet. Add one below.
          </p>
        )}

        {items.map((item) => (
          <div
            key={item.localId}
            className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{item.exerciseName}</p>
                  {item.exerciseCategory && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-0.5 capitalize">{item.exerciseCategory}</p>
                  )}
                </div>
                <button
                  onClick={() => handleInfoClick(item.exerciseId)}
                  title="Exercise info"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-600 dark:hover:border-zinc-400 dark:hover:text-zinc-300 transition-colors text-xs font-medium flex items-center justify-center leading-none"
                >
                  i
                </button>
                <button
                  onClick={() => handlePerfClick(item.exerciseId, item.exerciseName, 'last')}
                  title="Last session"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="6" cy="6" r="5" />
                    <path d="M6 3v3l1.5 1.5" />
                  </svg>
                </button>
                <button
                  onClick={() => handlePerfClick(item.exerciseId, item.exerciseName, 'best')}
                  title="Best session"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3.5 1.5h5v3.5a2.5 2.5 0 0 1-5 0V1.5z" />
                    <path d="M6 7v1.5" />
                    <path d="M4 9h4" />
                    <path d="M1.5 2.5h2" />
                    <path d="M8.5 2.5h2" />
                  </svg>
                </button>
                <button
                  onClick={() => handlePerfClick(item.exerciseId, item.exerciseName, 'best60')}
                  title="Best · 60 days"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M7 1.5L3.5 6.5H6.5L5 10.5" />
                  </svg>
                </button>
              </div>
              <button
                onClick={() => handleRemove(item.localId)}
                className="shrink-0 text-zinc-300 hover:text-red-500 dark:text-zinc-700 dark:hover:text-red-500 transition-colors leading-none text-lg"
              >
                ✕
              </button>
            </div>

            {/* Sets / Reps / Weight inputs */}
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400 dark:text-zinc-600 uppercase tracking-wide">Sets</span>
                <input
                  type="number"
                  min={1}
                  value={item.sets}
                  onChange={(e) => updateItem(item.localId, { sets: Number(e.target.value) || 1 })}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400 dark:text-zinc-600 uppercase tracking-wide">Reps</span>
                <input
                  type="number"
                  min={1}
                  value={item.reps}
                  onChange={(e) => updateItem(item.localId, { reps: Number(e.target.value) || 1 })}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400 dark:text-zinc-600 uppercase tracking-wide">Weight (kg)</span>
                <input
                  type="number"
                  min={0}
                  value={item.weight ?? ''}
                  placeholder="—"
                  onChange={(e) => updateItem(item.localId, { weight: e.target.value ? Number(e.target.value) : null })}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none"
                />
              </label>
            </div>
          </div>
        ))}

        {/* Add exercise */}
        <button
          onClick={() => setShowPicker(true)}
          className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 py-4 text-sm font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 hover:border-orange-400 hover:text-orange-500 transition-colors"
        >
          + Add exercise
        </button>

        {/* Start now */}
        <button
          onClick={handleStartNow}
          disabled={isPending}
          className="w-full rounded-xl bg-orange-500 hover:bg-orange-600 py-3 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-40 transition-colors shadow-md shadow-orange-200 dark:shadow-none"
        >
          {isPending ? '…' : isScheduling ? 'Schedule' : 'Start now'}
        </button>

        {/* Delete (edit mode only) */}
        {template && (
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="text-sm text-red-500 hover:text-red-600 transition-colors disabled:opacity-40 text-center"
          >
            Delete template
          </button>
        )}
      </main>

      {/* Info modal */}
      {infoLoading && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
          <div className="w-10 h-10 rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white animate-spin" />
        </div>
      )}
      {infoExercise && (
        <ExerciseInfoModal exercise={infoExercise} onClose={() => setInfoExercise(null)} />
      )}
      {perfModal && (
        <LastPerfModal
          exerciseName={perfModal.name}
          title={PERF_TITLE[perfModal.mode]}
          data={perfData}
          loading={perfLoading}
          onClose={() => setPerfModal(null)}
        />
      )}

      {/* Exercise picker */}
      {showPicker && (
        <ExercisePickerSheet
          exercises={exercises}
          onSelect={handleAddExercise}
          onInfoClick={handleInfoClick}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Paste overwrite confirmation */}
      {showPasteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-1">Overwrite?</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Replace current exercises?</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Your current exercise list will be replaced with the clipboard content.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowPasteConfirm(false)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyPaste}
                className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 py-2.5 text-sm font-bold text-white transition-colors"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
