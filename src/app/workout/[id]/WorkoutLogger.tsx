'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { addSet, deleteSet } from '@/app/actions/sets'
import { finishWorkout } from '@/app/actions/workouts'
import { fetchExerciseDetails } from '@/app/actions/exercises'
import ExerciseInfoModal from './ExerciseInfoModal'

// Slim type used for the picker list (initial page load)
type Exercise = {
  id: number
  name: string
  category: string | null
  equipment: string | null
}

// Full type used only in the info modal (lazy-loaded)
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

type SetRow = {
  id: number
  exercise_id: number
  weight: number | null
  reps: number | null
  duration_minutes: number | null
  distance: number | null
  exercises: { name: string } | null
}

type Workout = {
  id: number
  date: string
  sets: SetRow[]
}

export default function WorkoutLogger({
  workout,
  exercises,
}: {
  workout: Workout
  exercises: Exercise[]
}) {
  const [sets, setSets] = useState<SetRow[]>(workout.sets)
  const [showPicker, setShowPicker] = useState(false)
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null)
  const [infoExercise, setInfoExercise] = useState<ExerciseDetails | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // exercises as vertical list, sets as horizontal chips per exercise
  const grouped = sets.reduce<Record<number, { name: string; sets: SetRow[] }>>((acc, s) => {
    if (!acc[s.exercise_id]) {
      acc[s.exercise_id] = {
        name: s.exercises?.name ?? String(s.exercise_id),
        sets: [],
      }
    }
    acc[s.exercise_id].sets.push(s)
    return acc
  }, {})

  async function handleInfoClick(exerciseId: number) {
    setInfoLoading(true)
    const details = await fetchExerciseDetails(exerciseId)
    setInfoLoading(false)
    if (details) setInfoExercise(details as ExerciseDetails)
  }

  function handleSelectExercise(ex: Exercise) {
    const previous = sets.filter((s) => s.exercise_id === ex.id).at(-1)
    setSelectedExercise(ex)
    setShowPicker(false)
    setSearch('')
    setWeight(previous?.weight != null ? String(previous.weight) : '')
    setReps(previous?.reps != null ? String(previous.reps) : '')
    setError(null)
  }

  function handleAddSet() {
    if (!selectedExercise) return
    setError(null)

    const data = {
      weight: weight ? Number(weight) : null,
      reps: reps ? Number(reps) : null,
    }

    startTransition(async () => {
      const result = await addSet(workout.id, selectedExercise.id, data)
      if ('error' in result) {
        setError(result.error ?? 'Unknown error')
        return
      }
      setSets((prev) => [
        ...prev,
        {
          id: result.id as number,
          exercise_id: selectedExercise.id,
          weight: data.weight,
          reps: data.reps,
          duration_minutes: null,
          distance: null,
          exercises: { name: selectedExercise.name },
        },
      ])
      setWeight('')
      setReps('')
    })
  }

  function handleDeleteSet(setId: number) {
    startTransition(async () => {
      await deleteSet(setId)
      setSets((prev) => prev.filter((s) => s.id !== setId))
    })
  }

  const filteredExercises = search
    ? exercises.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : exercises

  const finishWithId = finishWorkout.bind(null, workout.id)

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          ← Dashboard
        </Link>
        <h1 className="text-sm font-medium text-zinc-900 dark:text-white">
          {new Date(workout.date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </h1>
        <form action={finishWithId}>
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            Finish
          </button>
        </form>
      </header>

      <main className="max-w-lg mx-auto px-6 py-6 flex flex-col gap-6">

        {/* Exercises — vertical list, sets — horizontal chips */}
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
              {group.sets.map((s, i) => (
                <div
                  key={s.id}
                  className="flex items-center gap-1.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-1.5"
                >
                  <span className="text-xs text-zinc-400 dark:text-zinc-600">#{i + 1}</span>
                  <span className="text-xs font-medium text-zinc-900 dark:text-white">
                    {s.weight != null ? `${s.weight}kg` : '—'}
                    {s.reps != null ? ` × ${s.reps}` : ''}
                    {s.duration_minutes != null ? ` ${s.duration_minutes}min` : ''}
                  </span>
                  <button
                    onClick={() => handleDeleteSet(s.id)}
                    disabled={isPending}
                    className="text-zinc-300 hover:text-red-500 dark:text-zinc-700 dark:hover:text-red-500 transition-colors leading-none"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {sets.length === 0 && (
          <p className="text-sm text-zinc-400 dark:text-zinc-600">
            No sets yet. Pick an exercise to get started.
          </p>
        )}

        {/* Add set */}
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
                disabled={isPending || (!weight && !reps)}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900 disabled:opacity-40"
              >
                {isPending ? '…' : 'Add'}
              </button>
            </div>
            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}
          </div>
        )}
      </main>

      {/* Exercise info modal */}
      {infoLoading && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="w-10 h-10 rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white animate-spin" />
        </div>
      )}
      {infoExercise && (
        <ExerciseInfoModal exercise={infoExercise} onClose={() => setInfoExercise(null)} />
      )}

      {/* Exercise picker */}
      {showPicker && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end z-50"
          onClick={() => setShowPicker(false)}
        >
          <div
            className="w-full bg-white dark:bg-zinc-900 rounded-t-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
              <input
                autoFocus
                type="text"
                placeholder="Search exercises..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm outline-none"
              />
            </div>
            <ul className="overflow-y-auto flex-1">
              {filteredExercises.slice(0, 50).map((ex) => (
                <li key={ex.id}>
                  <button
                    onClick={() => handleSelectExercise(ex)}
                    className="w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">{ex.name}</p>
                    {ex.category && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-0.5">{ex.category}</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
