export type PreviousPerformance = {
  sets: Array<{
    weight: number | null
    reps: number | null
    duration_minutes: number | null
    distance: number | null
  }>
}

/**
 * Match each current set to the same set number from the latest session.
 * When the latest session had fewer sets, keep its final set visible instead
 * of dropping the comparison exactly when the athlete adds volume.
 */
export function previousSetAt(
  performance: PreviousPerformance | null | undefined,
  setIndex: number,
) {
  if (!performance?.sets.length) return null
  return performance.sets[Math.min(Math.max(0, setIndex), performance.sets.length - 1)]
}

export function previousSetLabel(
  performance: PreviousPerformance | null | undefined,
  setIndex: number,
  category: string | null,
): string {
  const set = previousSetAt(performance, setIndex)
  if (!set) return '—'

  if (category === 'cardio') {
    if (set.duration_minutes != null && set.distance != null) return `${set.duration_minutes}m · ${set.distance}km`
    if (set.duration_minutes != null) return `${set.duration_minutes}m`
    if (set.distance != null) return `${set.distance}km`
    return '—'
  }

  if (set.weight != null && set.reps != null) return `${set.weight}×${set.reps}`
  if (set.weight != null) return `${set.weight}kg`
  if (set.reps != null) return `×${set.reps}`
  return '—'
}

export function effortLabel(value: number | null): string {
  return value == null ? 'Rate effort' : `Effort ${value}/5`
}
