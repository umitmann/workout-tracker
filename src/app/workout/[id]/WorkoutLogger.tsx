'use client'

import { useState, useTransition, useEffect } from 'react'
import { finishWorkout, deleteWorkout, SetPayload } from '@/app/actions/workouts'
import { fetchExerciseDetails } from '@/app/actions/exercises'
import { fetchUserTemplates } from '@/app/actions/templates'
import { RoutineWithExercises } from '@/lib/dal'
import ExercisePickerSheet, { SlimExercise } from './ExercisePickerSheet'
import ExerciseInfoModal from './ExerciseInfoModal'

// ─── Types ───────────────────────────────────────────────────────────────────

type LocalSet = {
  localId: string
  exerciseId: number
  exerciseName: string
  weight: number | null
  reps: number | null
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

type Workout = {
  id: number
  date: string
  sets: {
    id: number
    exercise_id: number
    weight: number | null
    reps: number | null
    duration_minutes: number | null
    distance: number | null
    exercises: { name: string } | null
  }[]
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkoutLogger({
  workout,
  exercises,
}: {
  workout: Workout
  exercises: SlimExercise[]
}) {
  const [isPending, startTransition] = useTransition()

  // All sets live in client state only — committed on Finish
  const [localSets, setLocalSets] = useState<LocalSet[]>(() =>
    workout.sets.map((s) => ({
      localId: crypto.randomUUID(),
      exerciseId: s.exercise_id,
      exerciseName: s.exercises?.name ?? String(s.exercise_id),
      weight: s.weight,
      reps: s.reps,
    })),
  )

  // Add-set form
  const [selectedExercise, setSelectedExercise] = useState<SlimExercise | null>(null)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  // Inline set editing
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editWeight, setEditWeight] = useState('')
  const [editReps, setEditReps] = useState('')

  // Sheets & modals
  const [showPicker, setShowPicker] = useState(false)
  const [showImportPicker, setShowImportPicker] = useState(false)
  const [showAbandonPrompt, setShowAbandonPrompt] = useState(false)
  const [infoExercise, setInfoExercise] = useState<ExerciseDetails | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)

  // Template import
  const [templates, setTemplates] = useState<RoutineWithExercises[] | null>(null)
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Warn on browser tab close / refresh
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (localSets.length > 0) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [localSets.length])

  // ─── Grouped view ──────────────────────────────────────────────────────────

  const grouped = localSets.reduce<Record<number, { name: string; sets: LocalSet[] }>>(
    (acc, s) => {
      if (!acc[s.exerciseId]) acc[s.exerciseId] = { name: s.exerciseName, sets: [] }
      acc[s.exerciseId].sets.push(s)
      return acc
    },
    {},
  )

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleSelectExercise(ex: SlimExercise) {
    const previous = [...localSets].reverse().find((s) => s.exerciseId === ex.id)
    setSelectedExercise(ex)
    setShowPicker(false)
    setWeight(previous?.weight != null ? String(previous.weight) : '')
    setReps(previous?.reps != null ? String(previous.reps) : '')
    setAddError(null)
  }

  function handleAddSet() {
    if (!selectedExercise) return
    if (!weight && !reps) { setAddError('Enter weight or reps'); return }
    setLocalSets((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        exerciseId: selectedExercise.id,
        exerciseName: selectedExercise.name,
        weight: weight ? Number(weight) : null,
        reps: reps ? Number(reps) : null,
      },
    ])
    setWeight('')
    setReps('')
    setAddError(null)
  }

  function handleDeleteSet(localId: string) {
    setLocalSets((prev) => prev.filter((s) => s.localId !== localId))
  }

  function startEditSet(s: LocalSet) {
    setEditingId(s.localId)
    setEditWeight(s.weight != null ? String(s.weight) : '')
    setEditReps(s.reps != null ? String(s.reps) : '')
  }

  function saveEditSet(localId: string) {
    setLocalSets((prev) =>
      prev.map((s) =>
        s.localId === localId
          ? { ...s, weight: editWeight ? Number(editWeight) : null, reps: editReps ? Number(editReps) : null }
          : s,
      ),
    )
    setEditingId(null)
  }

  async function handleInfoClick(exerciseId: number) {
    setInfoLoading(true)
    const details = await fetchExerciseDetails(exerciseId)
    setInfoLoading(false)
    if (details) setInfoExercise(details as ExerciseDetails)
  }

  async function handleOpenImport() {
    setShowImportPicker(true)
    if (templates === null) {
      setLoadingTemplates(true)
      const data = await fetchUserTemplates()
      setTemplates(data)
      setLoadingTemplates(false)
    }
  }

  function handleImportTemplate(template: RoutineWithExercises) {
    const newSets: LocalSet[] = []
    const sorted = [...template.routine_exercises].sort((a, b) => a.order - b.order)
    for (const ex of sorted) {
      const name = ex.exercises?.name ?? String(ex.exercise_id)
      for (let i = 0; i < (ex.sets || 1); i++) {
        newSets.push({
          localId: crypto.randomUUID(),
          exerciseId: ex.exercise_id,
          exerciseName: name,
          weight: ex.weight,
          reps: ex.reps,
        })
      }
    }
    setLocalSets(newSets)
    setShowImportPicker(false)
  }

  function handleBack() {
    if (localSets.length > 0) {
      setShowAbandonPrompt(true)
    } else {
      startTransition(async () => {
        await deleteWorkout(workout.id)
      })
    }
  }

  function handleFinish() {
    const payload: SetPayload[] = localSets.map((s) => ({
      exercise_id: s.exerciseId,
      weight: s.weight,
      reps: s.reps,
    }))
    startTransition(async () => {
      await finishWorkout(workout.id, payload)
    })
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const dateLabel = new Date(workout.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={handleBack}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          ← Dashboard
        </button>
        <h1 className="text-sm font-medium text-zinc-900 dark:text-white">{dateLabel}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleFinish}
            disabled={isPending}
            className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white dark:bg-white dark:text-zinc-900 disabled:opacity-40"
          >
            {isPending ? '…' : 'Finish'}
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-6 flex flex-col gap-6">

        {/* Exercise groups */}
        {Object.entries(grouped).map(([exerciseId, group]) => (
          <div key={exerciseId} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{group.name}</h2>
                <button
                  onClick={() => handleInfoClick(Number(exerciseId))}
                  title="Exercise info"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-zinc-500 dark:hover:border-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors text-xs font-medium flex items-center justify-center leading-none"
                >
                  i
                </button>
              </div>
              <button
                onClick={() => {
                  const ex = exercises.find((e) => e.id === Number(exerciseId))
                  if (ex) handleSelectExercise(ex)
                }}
                className="flex items-center justify-center h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-900 hover:text-white dark:hover:bg-white dark:hover:text-zinc-900 transition-colors text-lg leading-none"
              >
                +
              </button>
            </div>

            <div className="flex flex-row flex-wrap gap-2">
              {group.sets.map((s, i) =>
                editingId === s.localId ? (
                  // Inline edit mode
                  <div
                    key={s.localId}
                    className="flex items-center gap-1.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-400 dark:border-zinc-500 px-2 py-1"
                  >
                    <span className="text-xs text-zinc-400 dark:text-zinc-600">#{i + 1}</span>
                    <input
                      type="number"
                      value={editWeight}
                      onChange={(e) => setEditWeight(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEditSet(s.localId)}
                      placeholder="kg"
                      className="w-12 text-xs bg-transparent outline-none text-zinc-900 dark:text-white"
                    />
                    <span className="text-xs text-zinc-400">×</span>
                    <input
                      type="number"
                      value={editReps}
                      onChange={(e) => setEditReps(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEditSet(s.localId)}
                      placeholder="reps"
                      className="w-10 text-xs bg-transparent outline-none text-zinc-900 dark:text-white"
                    />
                    <button
                      onClick={() => saveEditSet(s.localId)}
                      className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors text-xs"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-zinc-300 dark:text-zinc-700 hover:text-red-500 transition-colors text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  // Display mode — tap body to edit, tap ✕ to delete
                  <div
                    key={s.localId}
                    className="flex items-center gap-1.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                    onClick={() => startEditSet(s)}
                  >
                    <span className="text-xs text-zinc-400 dark:text-zinc-600">#{i + 1}</span>
                    <span className="text-xs font-medium text-zinc-900 dark:text-white">
                      {s.weight != null ? `${s.weight}kg` : '—'}
                      {s.reps != null ? ` × ${s.reps}` : ''}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSet(s.localId) }}
                      className="text-zinc-300 hover:text-red-500 dark:text-zinc-700 dark:hover:text-red-500 transition-colors leading-none"
                    >
                      ✕
                    </button>
                  </div>
                ),
              )}
            </div>
          </div>
        ))}

        {localSets.length === 0 && (
          <p className="text-sm text-zinc-400 dark:text-zinc-600">
            No sets yet. Pick an exercise or load a template.
          </p>
        )}

        {/* Load template button */}
        <button
          onClick={handleOpenImport}
          className="flex items-center justify-center gap-2 w-full rounded-xl border border-zinc-200 dark:border-zinc-700 py-3 text-sm text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          ↓ Load template
        </button>

        {/* Add set form */}
        {!selectedExercise ? (
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 py-4 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            + Add exercise
          </button>
        ) : (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-400 dark:text-zinc-600 uppercase tracking-wide">Adding set for</p>
              <button
                onClick={() => setShowPicker(true)}
                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors underline underline-offset-2"
              >
                change
              </button>
            </div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{selectedExercise.name}</p>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Weight (kg)"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none"
              />
              <input
                type="number"
                placeholder="Reps"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={handleAddSet}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
              >
                Add
              </button>
            </div>
            {addError && <p className="text-xs text-red-500">{addError}</p>}
          </div>
        )}
      </main>

      {/* Exercise info spinner + modal */}
      {infoLoading && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
          <div className="w-10 h-10 rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white animate-spin" />
        </div>
      )}
      {infoExercise && (
        <ExerciseInfoModal exercise={infoExercise} onClose={() => setInfoExercise(null)} />
      )}

      {/* Exercise picker */}
      {showPicker && (
        <ExercisePickerSheet
          exercises={exercises}
          onSelect={handleSelectExercise}
          onInfoClick={handleInfoClick}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Template import picker */}
      {showImportPicker && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end z-50"
          onClick={() => setShowImportPicker(false)}
        >
          <div
            className="w-full bg-white dark:bg-zinc-900 rounded-t-2xl max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Load template</h2>
            </div>
            <ul className="overflow-y-auto flex-1">
              {loadingTemplates && (
                <li className="flex items-center justify-center py-10">
                  <div className="w-8 h-8 rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white animate-spin" />
                </li>
              )}
              {!loadingTemplates && templates?.length === 0 && (
                <li className="px-5 py-6 text-sm text-zinc-400 dark:text-zinc-600">
                  No templates yet. Create one in Workouts.
                </li>
              )}
              {templates?.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => handleImportTemplate(t)}
                    className="w-full text-left px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">{t.name}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-0.5">
                      {t.routine_exercises.length} exercise{t.routine_exercises.length !== 1 ? 's' : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Abandon workout prompt */}
      {showAbandonPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Abandon workout?</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Your sets will not be saved.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAbandonPrompt(false)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Keep going
              </button>
              <button
                onClick={() => startTransition(async () => { await deleteWorkout(workout.id) })}
                disabled={isPending}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-40"
              >
                Abandon
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
