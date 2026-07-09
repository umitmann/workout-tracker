// Pure transformation cores extracted from dal.ts (ADR-0006 / WP-03).
// Each function takes plain arrays already fetched from Supabase and derives
// the shape the UI needs — no DB/Next imports, so these are unit-testable
// without a database or auth context.

export type SessionSet = { weight: number | null; reps: number | null }

export type WorkoutRef = { id: number; date: string }

export type SessionSetRow = SessionSet & { workout_id: number }

export type BestSession = { date: string; sets: SessionSet[] }

// Picks the session (workout) to show for "best session" / "last session"
// queries: the workout containing the single highest-weight set wins; if no
// set in the candidate pool has a weight (reps-only/bodyweight exercises),
// falls back to the most recent workout that has any sets at all.
//
// `workouts` must already be the candidate pool in the caller's desired
// priority order (most-recent-first) — a 60-day-window query simply passes a
// pool pre-filtered to that window, so an empty pool naturally yields null
// here even when unfiltered history exists elsewhere (checklist §7.8).
export function selectBestSession(sets: SessionSetRow[], workouts: WorkoutRef[]): BestSession | null {
  if (sets.length === 0) return null

  const dateById = new Map(workouts.map((w) => [w.id, w.date]))

  let bestWorkoutId: number | null = null
  let bestWeight = -Infinity
  for (const s of sets) {
    // dateById.has is defensive only — dal.ts queries sets with .in(workoutIds)
    // from the same workout pool, so orphaned workout_ids cannot occur there.
    if (s.weight != null && s.weight > bestWeight && dateById.has(s.workout_id)) {
      bestWeight = s.weight
      bestWorkoutId = s.workout_id
    }
  }

  if (bestWorkoutId == null) {
    const setsByWorkout = groupByWorkout(sets)
    for (const w of workouts) {
      if (setsByWorkout.has(w.id)) return { date: w.date, sets: setsByWorkout.get(w.id)! }
    }
    return null
  }

  return {
    date: dateById.get(bestWorkoutId)!,
    sets: sets.filter((s) => s.workout_id === bestWorkoutId).map(({ weight, reps }) => ({ weight, reps })),
  }
}

function groupByWorkout(sets: SessionSetRow[]): Map<number, SessionSet[]> {
  const grouped = new Map<number, SessionSet[]>()
  for (const s of sets) {
    if (!grouped.has(s.workout_id)) grouped.set(s.workout_id, [])
    grouped.get(s.workout_id)!.push({ weight: s.weight, reps: s.reps })
  }
  return grouped
}

export type DatedSet = { date: string; weight: number | null; reps: number | null }

export type HistoryPoint = {
  date: string
  maxWeight: number | null
  maxReps: number | null
  totalVolume: number | null
  setCount: number
}

// Reduces per-set rows (already joined to their workout's date) into one
// point per distinct date: max weight, max reps, total volume, and how many
// sets landed on that date. Weight-only or reps-only exercises naturally
// leave the missing side null (checklist §5.8), and the result is sorted by
// date ascending for charting.
export function aggregateHistory(sets: DatedSet[]): HistoryPoint[] {
  const byDate = new Map<string, { weights: number[]; reps: number[]; volumes: number[]; count: number }>()

  for (const s of sets) {
    if (!byDate.has(s.date)) byDate.set(s.date, { weights: [], reps: [], volumes: [], count: 0 })
    const entry = byDate.get(s.date)!
    entry.count++
    if (s.weight != null) entry.weights.push(s.weight)
    if (s.reps != null) entry.reps.push(s.reps)
    if (s.weight != null && s.reps != null) entry.volumes.push(s.weight * s.reps)
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, e]) => ({
      date,
      maxWeight: e.weights.length > 0 ? Math.max(...e.weights) : null,
      maxReps: e.reps.length > 0 ? Math.max(...e.reps) : null,
      totalVolume: e.volumes.length > 0 ? e.volumes.reduce((a, b) => a + b, 0) : null,
      setCount: e.count,
    }))
}

export type PreviewWorkout = { id: number; date: string; status: string }

export type PreviewSet = {
  exercise_id: number
  exercise_name: string
  weight: number | null
  reps: number | null
}

export type WorkoutPreviewExercise = {
  exerciseId: number
  exerciseName: string
  setCount: number
  firstSetReps: number | null
  firstSetWeight: number | null
}

// Builds the calendar month-view preview: a per-exercise name + set-count
// summary for every workout that has logged sets. Planned workouts get no
// entry at all (checklist §10.6) — there is nothing to preview until the
// user has actually logged something, regardless of status. Exercise order
// within a preview follows first-seen order in `setsByWorkout`.
export function buildPreviews(
  workouts: PreviewWorkout[],
  setsByWorkout: Map<number, PreviewSet[]>,
): Record<number, WorkoutPreviewExercise[]> {
  const previews: Record<number, WorkoutPreviewExercise[]> = {}

  for (const w of workouts) {
    if (w.status === 'planned') continue
    const sets = setsByWorkout.get(w.id)
    if (!sets || sets.length === 0) continue

    const grouped = new Map<number, WorkoutPreviewExercise>()
    for (const s of sets) {
      const existing = grouped.get(s.exercise_id)
      if (!existing) {
        grouped.set(s.exercise_id, {
          exerciseId: s.exercise_id,
          exerciseName: s.exercise_name,
          setCount: 1,
          firstSetReps: s.reps,
          firstSetWeight: s.weight,
        })
      } else {
        existing.setCount++
      }
    }
    previews[w.id] = Array.from(grouped.values())
  }

  return previews
}
