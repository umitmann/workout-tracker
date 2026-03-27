'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTemplate, saveTemplateExercises, deleteTemplate, TemplateExercisePayload } from '@/app/actions/templates'
import { startWorkoutFromTemplate, startPlannedWorkout, scheduleWorkout } from '@/app/actions/workouts'
import { fetchExerciseDetails, fetchLastExercisePerformance } from '@/app/actions/exercises'
import { LastExercisePerformance, RoutineWithExercises } from '@/lib/dal'
import ExercisePickerSheet, { SlimExercise } from '@/app/workout/[id]/ExercisePickerSheet'
import ExerciseInfoModal from '@/app/workout/[id]/ExerciseInfoModal'
import LastPerfModal from '@/app/workout/[id]/LastPerfModal'

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
  const [lastPerfExercise, setLastPerfExercise] = useState<{ id: number; name: string } | null>(null)
  const [lastPerfData, setLastPerfData] = useState<LastExercisePerformance | null>(null)
  const [lastPerfLoading, setLastPerfLoading] = useState(false)
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

  async function handleLastPerfClick(exerciseId: number, exerciseName: string) {
    setLastPerfExercise({ id: exerciseId, name: exerciseName })
    setLastPerfData(null)
    setLastPerfLoading(true)
    const data = await fetchLastExercisePerformance(exerciseId)
    setLastPerfData(data)
    setLastPerfLoading(false)
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
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-full bg-zinc-800 dark:bg-zinc-700 hover:bg-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-40 transition-colors"
        >
          {isPending ? '…' : 'Save'}
        </button>
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
                  onClick={() => handleLastPerfClick(item.exerciseId, item.exerciseName)}
                  title="Last session"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="6" cy="6" r="5" />
                    <path d="M6 3v3l1.5 1.5" />
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
      {lastPerfExercise && (
        <LastPerfModal
          exerciseName={lastPerfExercise.name}
          data={lastPerfData}
          loading={lastPerfLoading}
          onClose={() => setLastPerfExercise(null)}
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
    </div>
  )
}
