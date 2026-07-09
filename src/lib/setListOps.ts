// Pure LocalSet[] operations extracted from WorkoutLogger (finding H4): add,
// delete, inline edit/revert, exercise reorder, and rest recording. No React,
// no DB — the component calls these and persists the result.

export type LocalSet = {
  localId: string
  exerciseId: number
  exerciseName: string
  exerciseCategory: string | null
  weight: number | null
  reps: number | null
  duration_minutes: number | null
  distance: number | null
  rest_seconds: number | null
  done: boolean
}

export type SetEdit = Partial<
  Pick<LocalSet, 'weight' | 'reps' | 'duration_minutes' | 'distance' | 'done'>
>

// §4.9/§4.10: exercises stay in insertion order — appending is enough.
export function addSet(sets: LocalSet[], newSet: LocalSet): LocalSet[] {
  return [...sets, newSet]
}

export function deleteSet(sets: LocalSet[], localId: string): LocalSet[] {
  return sets.filter((s) => s.localId !== localId)
}

// §4.3/§4.4: commits an in-progress edit onto the target set only.
export function applyEdit(sets: LocalSet[], localId: string, edit: SetEdit): LocalSet[] {
  return sets.map((s) => (s.localId === localId ? { ...s, ...edit } : s))
}

// §4.5: reverts the target set to a prior snapshot (e.g. its value before
// editing began) — the caller supplies that snapshot since this module holds
// no history of its own.
export function cancelEdit(sets: LocalSet[], localId: string, priorValue: LocalSet): LocalSet[] {
  return sets.map((s) => (s.localId === localId ? priorValue : s))
}

// §4.11–4.13: moves an exercise's contiguous set block up/down one position,
// preserving each block's internal set order. No-ops at the list edges.
export function reorderExercise(
  sets: LocalSet[],
  exerciseId: number,
  direction: 'up' | 'down',
): LocalSet[] {
  const order: number[] = []
  for (const s of sets) {
    if (!order.includes(s.exerciseId)) order.push(s.exerciseId)
  }
  const idx = order.indexOf(exerciseId)
  const newIdx = direction === 'up' ? idx - 1 : idx + 1
  if (idx === -1 || newIdx < 0 || newIdx >= order.length) return sets

  const reordered = [...order]
  ;[reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]]
  return reordered.flatMap((id) => sets.filter((s) => s.exerciseId === id))
}

// §17.3/§17.5: attaches the *actual* elapsed rest time to the set that was
// just completed — never the configured target.
export function recordRestForSet(sets: LocalSet[], localId: string, elapsedSeconds: number): LocalSet[] {
  return sets.map((s) => (s.localId === localId ? { ...s, rest_seconds: elapsedSeconds } : s))
}
