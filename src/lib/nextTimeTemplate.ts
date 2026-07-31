export type NextTimeTemplateExercise = {
  exerciseId: number
  sets: number
  reps: number | null
  weight: number | null
  duration_minutes: number | null
  distance: number | null
  set_details: { weight: number | null; reps: number | null }[] | null
  tempo: string | null
  rest_seconds: number | null
  order: number
}

export type NextTimeSet = {
  exercise_id: number
  weight: number | null
  reps: number | null
  duration_minutes: number | null
  distance: number | null
}

export function mergeWorkoutSetsIntoTemplate(
  template: NextTimeTemplateExercise[],
  currentSets: NextTimeSet[],
): NextTimeTemplateExercise[] {
  const grouped = new Map<number, NextTimeSet[]>()
  for (const set of currentSets) {
    const rows = grouped.get(set.exercise_id) ?? []
    rows.push(set)
    grouped.set(set.exercise_id, rows)
  }

  const next = template.map((exercise) => {
    const rows = grouped.get(exercise.exerciseId)
    if (!rows?.length) return { ...exercise }
    grouped.delete(exercise.exerciseId)
    const first = rows[0]
    return {
      ...exercise,
      sets: rows.length,
      reps: first.reps,
      weight: first.weight,
      duration_minutes: first.duration_minutes,
      distance: first.distance,
      set_details: rows.map((row) => ({ weight: row.weight, reps: row.reps })),
    }
  })

  for (const [exerciseId, rows] of grouped) {
    const first = rows[0]
    next.push({
      exerciseId,
      sets: rows.length,
      reps: first.reps,
      weight: first.weight,
      duration_minutes: first.duration_minutes,
      distance: first.distance,
      set_details: rows.map((row) => ({ weight: row.weight, reps: row.reps })),
      tempo: null,
      rest_seconds: null,
      order: next.length,
    })
  }
  return next
}
