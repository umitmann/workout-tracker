'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { AvailableExercise } from '@/lib/dal'
import ExerciseSearch from './ExerciseSearch'

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export default function ExerciseLibrary({
  exercises,
  initialQuery = '',
  initialCategory = '',
}: {
  exercises: AvailableExercise[]
  initialQuery?: string
  initialCategory?: string
}) {
  // The authorized result remains only in this mounted page's memory. Search
  // and category changes never refetch, persist, or shared-cache a catalog
  // that can include relationship-scoped trainer exercises.
  const [query, setQuery] = useState(initialQuery)
  const [category, setCategory] = useState(initialCategory)
  const categories = useMemo(
    () => [...new Set(exercises.map((exercise) => exercise.category).filter((value): value is string => Boolean(value)))],
    [exercises],
  )
  const filtered = useMemo(() => {
    const needle = normalized(query)
    return exercises.filter((exercise) => (
      (!needle || normalized(exercise.name).includes(needle))
      && (!category || exercise.category === category)
    ))
  }, [category, exercises, query])

  function updateUrl(nextQuery: string, nextCategory: string) {
    const params = new URLSearchParams()
    if (nextQuery.trim()) params.set('q', nextQuery)
    if (nextCategory) params.set('category', nextCategory)
    const suffix = params.toString()
    window.history.replaceState(null, '', `/routines${suffix ? `?${suffix}` : ''}`)
  }

  function changeQuery(nextQuery: string) {
    setQuery(nextQuery)
    updateUrl(nextQuery, category)
  }

  function changeCategory(nextCategory: string) {
    setCategory(nextCategory)
    updateUrl(query, nextCategory)
  }

  return (
    <>
      <div className="mt-6 min-w-0 rounded-[1.4rem] border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <ExerciseSearch
          categories={categories}
          query={query}
          category={category}
          onQueryChange={changeQuery}
          onCategoryChange={changeCategory}
        />
      </div>
      <p aria-live="polite" className="mt-5 text-sm font-medium text-zinc-600 dark:text-zinc-300">
        {filtered.length} exercise{filtered.length === 1 ? '' : 's'}
      </p>

      <ul className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
        {filtered.map((exercise) => (
          <li key={exercise.id} className="min-w-0">
            <Link
              href={`/routines/${exercise.id}`}
              className="flex h-full min-h-20 w-full min-w-0 items-center justify-between gap-3 overflow-hidden rounded-[1.3rem] border border-zinc-200 bg-white px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-orange-900 sm:px-5"
            >
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-black text-zinc-950 dark:text-white">{exercise.name}</span>
                  {exercise.creator_id && <span className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[0.65rem] font-bold text-orange-800 dark:bg-orange-950 dark:text-orange-200">PT</span>}
                </span>
                {exercise.category && <span className="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400">{exercise.category}</span>}
              </span>
              {exercise.equipment && (
                <span className="max-w-[42%] shrink truncate rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {exercise.equipment}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
