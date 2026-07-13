// Expands a routine's exercises into individual set rows — the single
// implementation shared by the workout initializer and template import
// (previously duplicated in WorkoutLogger, findings H4/M9). DB-free.

import type { RoutineExerciseRow } from './dal'
import type { LocalSet } from './setListOps'

// Per-exercise scheme: explicit per-set targets (dropset/pyramid) if scheduled
// via `set_details`, else `sets` uniform rows of the exercise's weight/reps.
function schemeFor(ex: RoutineExerciseRow): { weight: number | null; reps: number | null }[] {
  if (ex.set_details && ex.set_details.length > 0) {
    return ex.set_details.map((d) => ({ weight: d.weight, reps: d.reps }))
  }
  return Array.from({ length: ex.sets || 1 }, () => ({ weight: ex.weight, reps: ex.reps }))
}

export function expandTemplate(routineExercises: RoutineExerciseRow[]): LocalSet[] {
  const sorted = [...routineExercises].sort((a, b) => a.order - b.order)
  return sorted.flatMap((ex) => {
    const name = ex.exercises?.name ?? String(ex.exercise_id)
    const category = ex.exercises?.category ?? null
    return schemeFor(ex).map((d) => ({
      localId: crypto.randomUUID(),
      exerciseId: ex.exercise_id,
      exerciseName: name,
      exerciseCategory: category,
      weight: d.weight,
      reps: d.reps,
      duration_minutes: ex.duration_minutes ?? null,
      distance: ex.distance ?? null,
      rest_seconds: null,
      difficulty: null,
      done: false,
    }))
  })
}
