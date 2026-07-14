export const PRIMARY_MUSCLE_FACTOR = 1
export const SECONDARY_MUSCLE_FACTOR = 0.5

export type ProgrammedExercise = {
  exerciseId: number
  sets: number
  setDetails?: readonly unknown[] | null
}

export type ExerciseMuscleMetadata = {
  id: number
  muscles: readonly string[] | null
  muscles_secondary?: readonly string[] | null
}

export type MuscleExposure = {
  muscle: string
  primarySets: number
  secondarySets: number
  score: number
  percentage: number
  exerciseIds: number[]
}

export type MuscleLoadResult = {
  muscles: MuscleExposure[]
  byMuscle: Record<string, MuscleExposure>
  maxScore: number
  totalProgrammedSets: number
  unclassifiedExerciseIds: number[]
}

function normalizeMuscles(muscles: readonly string[] | null | undefined): string[] {
  if (!muscles) return []
  return [...new Set(muscles.map((muscle) => muscle.trim().toLowerCase()).filter(Boolean))]
}

export function effectiveProgrammedSets(item: ProgrammedExercise): number {
  if (Array.isArray(item.setDetails)) return item.setDetails.length
  if (!Number.isFinite(item.sets)) return 0
  return Math.max(0, Math.floor(item.sets))
}

export function calculateMuscleLoad(
  items: readonly ProgrammedExercise[],
  exercises: readonly ExerciseMuscleMetadata[],
): MuscleLoadResult {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  const accumulators = new Map<
    string,
    Omit<MuscleExposure, 'percentage' | 'exerciseIds'> & { exerciseIds: Set<number> }
  >()
  const unclassifiedExerciseIds: number[] = []
  let totalProgrammedSets = 0

  function add(muscle: string, kind: 'primary' | 'secondary', sets: number, exerciseId: number) {
    const existing = accumulators.get(muscle) ?? {
      muscle,
      primarySets: 0,
      secondarySets: 0,
      score: 0,
      exerciseIds: new Set<number>(),
    }
    if (kind === 'primary') {
      existing.primarySets += sets
      existing.score += sets * PRIMARY_MUSCLE_FACTOR
    } else {
      existing.secondarySets += sets
      existing.score += sets * SECONDARY_MUSCLE_FACTOR
    }
    existing.exerciseIds.add(exerciseId)
    accumulators.set(muscle, existing)
  }

  for (const item of items) {
    const sets = effectiveProgrammedSets(item)
    if (sets === 0) continue
    totalProgrammedSets += sets
    const exercise = exerciseById.get(item.exerciseId)
    if (!exercise) {
      unclassifiedExerciseIds.push(item.exerciseId)
      continue
    }

    const primary = normalizeMuscles(exercise.muscles)
    const primarySet = new Set(primary)
    const secondary = normalizeMuscles(exercise.muscles_secondary).filter(
      (muscle) => !primarySet.has(muscle),
    )
    if (primary.length === 0 && secondary.length === 0) {
      unclassifiedExerciseIds.push(item.exerciseId)
      continue
    }
    for (const muscle of primary) add(muscle, 'primary', sets, item.exerciseId)
    for (const muscle of secondary) add(muscle, 'secondary', sets, item.exerciseId)
  }

  const maxScore = Math.max(0, ...[...accumulators.values()].map((entry) => entry.score))
  const muscles = [...accumulators.values()]
    .map<MuscleExposure>((entry) => ({
      muscle: entry.muscle,
      primarySets: entry.primarySets,
      secondarySets: entry.secondarySets,
      score: entry.score,
      percentage: maxScore === 0 ? 0 : Math.round((entry.score / maxScore) * 100),
      exerciseIds: [...entry.exerciseIds],
    }))
    .sort((a, b) => b.score - a.score || a.muscle.localeCompare(b.muscle))

  return {
    muscles,
    byMuscle: Object.fromEntries(muscles.map((entry) => [entry.muscle, entry])),
    maxScore,
    totalProgrammedSets,
    unclassifiedExerciseIds: [...new Set(unclassifiedExerciseIds)],
  }
}
