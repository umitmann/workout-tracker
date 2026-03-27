'use client'

import { useState, useTransition, useEffect } from 'react'
import { saveWorkoutProgress, completeWorkout, reopenWorkout, SetPayload } from '@/app/actions/workouts'
import { fetchExerciseDetails, fetchLastExercisePerformance } from '@/app/actions/exercises'
import { fetchUserTemplates } from '@/app/actions/templates'
import { LastExercisePerformance, RoutineWithExercises } from '@/lib/dal'
import ExercisePickerSheet, { SlimExercise } from './ExercisePickerSheet'
import ExerciseInfoModal from './ExerciseInfoModal'
import LastPerfModal from './LastPerfModal'

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
  status: string
  template_id?: string | null
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
  initialTemplate,
}: {
  workout: Workout
  exercises: SlimExercise[]
  initialTemplate?: RoutineWithExercises | null
}) {
  const [isPending, startTransition] = useTransition()

  // All sets live in client state only — committed on Finish
  const [localSets, setLocalSets] = useState<LocalSet[]>(() => {
    if (workout.sets.length > 0) {
      return workout.sets.map((s) => ({
        localId: crypto.randomUUID(),
        exerciseId: s.exercise_id,
        exerciseName: s.exercises?.name ?? String(s.exercise_id),
        weight: s.weight,
        reps: s.reps,
      }))
    }
    if (initialTemplate && workout.status !== 'completed') {
      const sorted = [...initialTemplate.routine_exercises].sort((a, b) => a.order - b.order)
      return sorted.flatMap((ex) => {
        const name = ex.exercises?.name ?? String(ex.exercise_id)
        return Array.from({ length: ex.sets || 1 }, () => ({
          localId: crypto.randomUUID(),
          exerciseId: ex.exercise_id,
          exerciseName: name,
          weight: ex.weight,
          reps: ex.reps,
        }))
      })
    }
    return []
  })

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
  const [showSaveWarning, setShowSaveWarning] = useState(false)
  const [savedOnce, setSavedOnce] = useState(false)
  const [infoExercise, setInfoExercise] = useState<ExerciseDetails | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [lastPerfExercise, setLastPerfExercise] = useState<{ id: number; name: string } | null>(null)
  const [lastPerfData, setLastPerfData] = useState<LastExercisePerformance | null>(null)
  const [lastPerfLoading, setLastPerfLoading] = useState(false)

  // Template import
  const [templates, setTemplates] = useState<RoutineWithExercises[] | null>(null)
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Warn on browser tab close / refresh — only for active workouts with unsaved sets
  useEffect(() => {
    if (workout.status === 'completed') return
    const handler = (e: BeforeUnloadEvent) => {
      if (localSets.length > 0) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [workout.status, localSets.length])

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

  async function handleLastPerfClick(exerciseId: number, exerciseName: string) {
    setLastPerfExercise({ id: exerciseId, name: exerciseName })
    setLastPerfData(null)
    setLastPerfLoading(true)
    const data = await fetchLastExercisePerformance(exerciseId)
    setLastPerfData(data)
    setLastPerfLoading(false)
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
    if (workout.status === 'completed') {
      window.location.href = '/dashboard'
      return
    }
    if (localSets.length > 0) {
      setShowAbandonPrompt(true)
    } else {
      window.location.href = '/dashboard'
    }
  }

  function buildPayload(): SetPayload[] {
    return localSets.map((s) => ({
      exercise_id: s.exerciseId,
      weight: s.weight,
      reps: s.reps,
    }))
  }

  function handleSaveProgress() {
    if (!savedOnce) {
      setShowSaveWarning(true)
      return
    }
    startTransition(async () => {
      await saveWorkoutProgress(workout.id, buildPayload())
    })
  }

  function confirmSaveProgress() {
    setSavedOnce(true)
    setShowSaveWarning(false)
    startTransition(async () => {
      await saveWorkoutProgress(workout.id, buildPayload())
    })
  }

  function handleComplete() {
    startTransition(async () => {
      await completeWorkout(workout.id, buildPayload())
    })
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const dateLabel = new Date(workout.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })

  // ── Completed: read-only summary ─────────────────────────────────────────
  if (workout.status === 'completed') {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <button
            onClick={() => { window.location.href = '/dashboard' }}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            ← Back
          </button>
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-500">Completed</p>
            <h1 className="text-sm font-bold text-zinc-900 dark:text-white">{dateLabel}</h1>
          </div>
          <button
            onClick={() => startTransition(async () => { await reopenWorkout(workout.id) })}
            disabled={isPending}
            className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 disabled:opacity-40 transition-colors"
          >
            Edit
          </button>
        </header>

        <main className="max-w-lg mx-auto px-6 py-6 flex flex-col gap-6">
          {localSets.length === 0 && (
            <p className="text-sm text-zinc-400 dark:text-zinc-600">No sets were logged.</p>
          )}
          {Object.entries(grouped).map(([exerciseId, group]) => (
            <div key={exerciseId} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-900 dark:text-white">{group.name}</h2>
                <button
                  onClick={() => handleInfoClick(Number(exerciseId))}
                  title="Exercise info"
                  className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none"
                >
                  i
                </button>
                <button
                  onClick={() => handleLastPerfClick(Number(exerciseId), group.name)}
                  title="Last session"
                  className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="6" cy="6" r="5" />
                    <path d="M6 3v3l1.5 1.5" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {group.sets.map((s, i) => (
                  <div
                    key={s.localId}
                    className="grid grid-cols-[2rem_1fr_1fr] items-center gap-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3"
                  >
                    <span className="text-xs font-bold text-zinc-400 dark:text-zinc-600">#{i + 1}</span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 leading-none mb-0.5">Weight</p>
                      <p className="text-sm font-bold text-zinc-900 dark:text-white">
                        {s.weight != null ? `${s.weight} kg` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 leading-none mb-0.5">Reps</p>
                      <p className="text-sm font-bold text-zinc-900 dark:text-white">
                        {s.reps != null ? s.reps : '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </main>

        {infoLoading && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
            <div className="w-10 h-10 rounded-full border-2 border-zinc-600 border-t-orange-500 animate-spin" />
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
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <button
          onClick={handleBack}
          className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          ← Back
        </button>
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-500">Active</p>
          <h1 className="text-sm font-bold text-zinc-900 dark:text-white">{dateLabel}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveProgress}
            disabled={isPending}
            className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-zinc-500 disabled:opacity-40 transition-colors"
          >
            Save
          </button>
          <button
            onClick={handleComplete}
            disabled={isPending}
            className="rounded-full bg-orange-500 hover:bg-orange-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-40 transition-colors"
          >
            {isPending ? '…' : 'Done'}
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-6 flex flex-col gap-6">

        {/* Exercise groups */}
        {Object.entries(grouped).map(([exerciseId, group]) => (
          <div key={exerciseId} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wide truncate">{group.name}</h2>
                <button
                  onClick={() => handleInfoClick(Number(exerciseId))}
                  title="Exercise info"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none"
                >
                  i
                </button>
                <button
                  onClick={() => handleLastPerfClick(Number(exerciseId), group.name)}
                  title="Last session"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="6" cy="6" r="5" />
                    <path d="M6 3v3l1.5 1.5" />
                  </svg>
                </button>
              </div>
              <button
                onClick={() => {
                  const ex = exercises.find((e) => e.id === Number(exerciseId))
                  if (ex) handleSelectExercise(ex)
                }}
                className="flex items-center justify-center h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-orange-500 hover:text-white transition-colors text-lg leading-none"
              >
                +
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              {group.sets.map((s, i) =>
                editingId === s.localId ? (
                  <div
                    key={s.localId}
                    className="flex items-center gap-3 rounded-xl bg-white dark:bg-zinc-900 border-2 border-orange-400 px-4 py-3"
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        saveEditSet(s.localId)
                      }
                    }}
                  >
                    <span className="text-xs font-bold text-orange-400 w-8 shrink-0">#{i + 1}</span>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">Weight (kg)</span>
                        <input
                          type="number"
                          value={editWeight}
                          onChange={(e) => setEditWeight(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEditSet(s.localId)}
                          placeholder="—"
                          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-orange-400 transition-colors"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">Reps</span>
                        <input
                          type="number"
                          value={editReps}
                          onChange={(e) => setEditReps(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEditSet(s.localId)}
                          placeholder="—"
                          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-orange-400 transition-colors"
                        />
                      </div>
                    </div>
                    <button onClick={() => setEditingId(null)} className="text-zinc-300 dark:text-zinc-700 hover:text-red-500 transition-colors text-sm shrink-0">✕</button>
                  </div>
                ) : (
                  <div
                    key={s.localId}
                    className="grid grid-cols-[2rem_1fr_1fr_2rem] items-center gap-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3 cursor-pointer hover:border-orange-400 dark:hover:border-orange-500 transition-colors"
                    onClick={() => startEditSet(s)}
                  >
                    <span className="text-xs font-bold text-zinc-400 dark:text-zinc-600">#{i + 1}</span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 leading-none mb-0.5">Weight</p>
                      <p className="text-sm font-bold text-zinc-900 dark:text-white">
                        {s.weight != null ? `${s.weight} kg` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 leading-none mb-0.5">Reps</p>
                      <p className="text-sm font-bold text-zinc-900 dark:text-white">
                        {s.reps != null ? s.reps : '—'}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSet(s.localId) }}
                      className="text-zinc-300 hover:text-red-500 dark:text-zinc-700 dark:hover:text-red-500 transition-colors"
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
          <p className="text-sm font-medium text-zinc-400 dark:text-zinc-600">
            No sets yet. Pick an exercise or load a template.
          </p>
        )}

        {/* Load template button */}
        <button
          onClick={handleOpenImport}
          className="flex items-center justify-center gap-2 w-full rounded-xl border border-zinc-200 dark:border-zinc-700 py-3 text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
        >
          ↓ Load template
        </button>

        {/* Add set form */}
        {!selectedExercise ? (
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 py-5 text-sm font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 hover:border-orange-400 hover:text-orange-500 transition-colors"
          >
            + Add exercise
          </button>
        ) : (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Adding set</p>
              <button
                onClick={() => setShowPicker(true)}
                className="text-xs font-bold text-orange-500 hover:text-orange-600 transition-colors"
              >
                change
              </button>
            </div>
            <p className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wide">{selectedExercise.name}</p>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Weight (kg)"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm outline-none focus:border-orange-400 transition-colors"
              />
              <input
                type="number"
                placeholder="Reps"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm outline-none focus:border-orange-400 transition-colors"
              />
              <button
                onClick={handleAddSet}
                className="rounded-lg bg-orange-500 hover:bg-orange-600 px-4 py-2 text-sm font-bold text-white transition-colors"
              >
                Add
              </button>
            </div>
            {addError && <p className="text-xs font-medium text-red-500">{addError}</p>}
          </div>
        )}
      </main>

      {/* Exercise info spinner + modal */}
      {infoLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="w-10 h-10 rounded-full border-2 border-zinc-600 border-t-orange-500 animate-spin" />
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
          onSelect={handleSelectExercise}
          onInfoClick={handleInfoClick}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Template import picker */}
      {showImportPicker && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
          onClick={() => setShowImportPicker(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl max-h-[75vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Load template</p>
            </div>
            <ul className="overflow-y-auto flex-1">
              {loadingTemplates && (
                <li className="flex items-center justify-center py-10">
                  <div className="w-8 h-8 rounded-full border-2 border-zinc-600 border-t-orange-500 animate-spin" />
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
                    className="w-full text-left px-5 py-3.5 hover:bg-orange-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                  >
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">{t.name}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-600 mt-0.5">
                      {t.routine_exercises.length} exercise{t.routine_exercises.length !== 1 ? 's' : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Save progress warning */}
      {showSaveWarning && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-1">Heads up</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Progress won't be tracked</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Sets are saved but this workout won't count toward exercise history. Hit <strong>Done</strong> when you finish to track your progress.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSaveWarning(false)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSaveProgress}
                disabled={isPending}
                className="flex-1 rounded-xl bg-zinc-800 dark:bg-zinc-700 py-2.5 text-sm font-bold text-white hover:bg-zinc-700 transition-colors disabled:opacity-40"
              >
                Save anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Abandon workout prompt */}
      {showAbandonPrompt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-red-500 mb-1">Warning</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Abandon workout?</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Your sets will not be saved.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAbandonPrompt(false)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Keep going
              </button>
              <button
                onClick={() => { window.location.href = '/dashboard' }}
                className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 py-2.5 text-sm font-bold text-white transition-colors"
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
