// Tile 4: pure helpers around the workout clipboard, extracted so the
// lossless copy -> per-set paste round-trip is unit-testable without React.
// No DB, no randomness dependency beyond an injectable id factory.

import type { LocalSet } from './setListOps'
import type { ClipboardEntry } from './WorkoutClipboardContext'

// Copy is state-independent and lossless: every exercise, every set's own
// weight/reps, in the order they appear in `localSets` — identical whether
// called from the active, completed, or editing view (they all feed the same
// grouped/exerciseOrder shape). No flattening to "set #1 x count".
export function buildClipboardEntries(
  exerciseOrder: number[],
  grouped: Record<number, { name: string; sets: Pick<LocalSet, 'weight' | 'reps'>[] }>,
): ClipboardEntry[] {
  return exerciseOrder.map((exerciseId) => ({
    exerciseId,
    exerciseName: grouped[exerciseId].name,
    sets: grouped[exerciseId].sets.map((s) => ({ weight: s.weight, reps: s.reps })),
  }))
}

// Rebuilds real per-set LocalSet rows from a clipboard entry list — one row
// per copied set, each with its own weight/reps (not `setCount x one pair`).
// Pasted/imported-via-clipboard sets are always fresh: never done, no
// difficulty carried over, no rest recorded yet.
export function clipboardEntriesToLocalSets(
  entries: ClipboardEntry[],
  makeId: () => string = () => crypto.randomUUID(),
): LocalSet[] {
  return entries.flatMap((entry) =>
    entry.sets.map((s) => ({
      localId: makeId(),
      exerciseId: entry.exerciseId,
      exerciseName: entry.exerciseName,
      exerciseCategory: null,
      weight: s.weight,
      reps: s.reps,
      duration_minutes: null,
      distance: null,
      rest_seconds: null,
      difficulty: null,
      done: false,
    })),
  )
}
