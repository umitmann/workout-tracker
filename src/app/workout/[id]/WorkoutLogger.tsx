'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { addSet, deleteSet } from '@/app/actions/sets'
import { finishWorkout } from '@/app/actions/workouts'

type Exercise = {
  id: number
  name: string
  category: string | null
  equipment: string | null
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
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()

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

  function handleSelectExercise(ex: Exercise) {
    setSelectedExercise(ex)
    setShowPicker(false)
    setSearch('')
    setWeight('')
    setReps('')
  }

  function handleAddSet() {
    if (!selectedExercise) return

    const data = {
      weight: weight ? Number(weight) : null,
      reps: reps ? Number(reps) : null,
    }

    startTransition(async () => {
      const result = await addSet(workout.id, selectedExercise.id, data)
      if ('id' in result) {
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
      }
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
        {Object.entries(grouped).map(([exerciseId, group]) => (
          <div key={exerciseId}>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">
              {group.name}
            </h2>
            <div className="flex flex-col gap-1">
              {group.sets.map((s, i) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-2"
                >
                  <span className="text-xs text-zinc-400 dark:text-zinc-600 w-5">#{i + 1}</span>
                  <span className="text-sm text-zinc-900 dark:text-white flex-1">
                    {s.weight != null ? `${s.weight} kg` : '—'}
                    {s.reps != null ? ` × ${s.reps}` : ''}
                    {s.duration_minutes != null ? ` ${s.duration_minutes} min` : ''}
                  </span>
                  <button
                    onClick={() => handleDeleteSet(s.id)}
                    disabled={isPending}
                    className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
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

        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-3">
          <button
            onClick={() => setShowPicker(true)}
            className="text-left text-sm font-medium text-zinc-900 dark:text-white"
          >
            {selectedExercise ? selectedExercise.name : 'Pick exercise →'}
          </button>

          {selectedExercise && (
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
                Add
              </button>
            </div>
          )}
        </div>
      </main>

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
                      <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-0.5">
                        {ex.category}
                      </p>
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
