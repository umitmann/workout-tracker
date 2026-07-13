// The workout+template → initial LocalSet[] matrix. Enforces
// behaviour-checklist §2: a completed workout's sets always come from the DB
// and never fall back to the template, even when the DB has none (finding H4).

import { expandTemplate } from './expandTemplate'
import type { LocalSet } from './setListOps'
import type { RoutineWithExercises } from './dal'

export type DbSet = {
  id: number
  exercise_id: number
  weight: number | null
  reps: number | null
  duration_minutes: number | null
  distance: number | null
  rest_seconds?: number | null
  difficulty?: number | null
  exercises: { name: string; category: string | null } | null
}

export type WorkoutForDerive = {
  status: string
  sets: DbSet[]
}

function fromDbSets(sets: DbSet[]): LocalSet[] {
  return sets.map((s) => ({
    localId: crypto.randomUUID(),
    exerciseId: s.exercise_id,
    exerciseName: s.exercises?.name ?? String(s.exercise_id),
    exerciseCategory: s.exercises?.category ?? null,
    weight: s.weight,
    reps: s.reps,
    duration_minutes: s.duration_minutes,
    distance: s.distance,
    rest_seconds: s.rest_seconds ?? null,
    difficulty: s.difficulty ?? null,
    done: true,
  }))
}

export function deriveInitialSets(
  workout: WorkoutForDerive,
  template: RoutineWithExercises | null,
): LocalSet[] {
  // §2.4/§2.5: a completed workout's sets are the source of truth, full stop —
  // an empty result here means "no sets were logged", never "load the template".
  if (workout.status === 'completed') {
    return fromDbSets(workout.sets)
  }
  // §2.3/§2.8: any saved sets (even one) mean this workout has already diverged
  // from the template — template values must not resurface alongside them.
  if (workout.sets.length > 0) {
    return fromDbSets(workout.sets)
  }
  // §2.2: nothing saved yet — preload the template into local state only.
  if (template) {
    return expandTemplate(template.routine_exercises)
  }
  // §2.1: fresh, blank workout.
  return []
}
