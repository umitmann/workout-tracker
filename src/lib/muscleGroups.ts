// Groups the raw `exercises.muscles` values into human-friendly muscle groups
// for the exercise picker. Pure + DB-free so it can be unit-tested.

export type MuscleGroup = {
  key: string
  label: string
  muscles: string[]
}

export const MUSCLE_GROUPS: MuscleGroup[] = [
  { key: 'chest', label: 'Chest', muscles: ['chest'] },
  { key: 'back', label: 'Back', muscles: ['lats', 'middle back', 'lower back', 'traps'] },
  { key: 'shoulders', label: 'Shoulders', muscles: ['shoulders', 'neck'] },
  { key: 'arms', label: 'Arms', muscles: ['biceps', 'triceps', 'forearms'] },
  { key: 'core', label: 'Core', muscles: ['abdominals'] },
  { key: 'legs', label: 'Legs', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors'] },
]

const MUSCLE_TO_GROUP: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const g of MUSCLE_GROUPS) {
    for (const m of g.muscles) map[m] = g.key
  }
  return map
})()

export function muscleGroupOf(muscle: string): string | null {
  return MUSCLE_TO_GROUP[muscle] ?? null
}

export function musclesForGroup(groupKey: string): string[] {
  return MUSCLE_GROUPS.find((g) => g.key === groupKey)?.muscles ?? []
}

type MuscledExercise = { muscles: string[] | null }

// Counts how many exercises target each muscle group (any primary muscle match).
export function countByGroup<T extends MuscledExercise>(exercises: T[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const g of MUSCLE_GROUPS) counts[g.key] = 0
  for (const ex of exercises) {
    if (!ex.muscles) continue
    const hitGroups = new Set<string>()
    for (const m of ex.muscles) {
      const g = muscleGroupOf(m)
      if (g) hitGroups.add(g)
    }
    for (const g of hitGroups) counts[g]++
  }
  return counts
}
