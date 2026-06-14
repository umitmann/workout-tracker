export type FilterableExercise = {
  name: string
  category: string | null
  muscles: string[] | null
}

export type ExerciseFilters = {
  text: string
  muscles: string[]
  categories: string[]
}

export function filterExercises<T extends FilterableExercise>(
  exercises: T[],
  filters: ExerciseFilters,
): T[] {
  const { text, muscles, categories } = filters
  let list = exercises

  if (text) {
    const q = text.toLowerCase()
    list = list.filter((e) => e.name.toLowerCase().includes(q))
  }

  if (muscles.length > 0) {
    list = list.filter(
      (e) => e.muscles && e.muscles.some((m) => muscles.includes(m)),
    )
  }

  if (categories.length > 0) {
    list = list.filter((e) => e.category && categories.includes(e.category))
  }

  return list
}
