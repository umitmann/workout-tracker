'use client'

import { useState, useMemo } from 'react'
import { filterExercises } from '@/lib/filterExercises'

export type SlimExercise = {
  id: number
  name: string
  category: string | null
  equipment: string | null
  muscles: string[] | null
}

type PerfMode = 'last' | 'best' | 'best60'

export default function ExercisePickerSheet({
  exercises,
  activeMuscles,
  onMusclesChange,
  activeCategories,
  onCategoriesChange,
  onSelect,
  onInfoClick,
  onPerfClick,
  onClose,
}: {
  exercises: SlimExercise[]
  activeMuscles: string[]
  onMusclesChange: (muscles: string[]) => void
  activeCategories: string[]
  onCategoriesChange: (categories: string[]) => void
  onSelect: (exercise: SlimExercise) => void
  onInfoClick: (exerciseId: number) => void
  onPerfClick: (exerciseId: number, exerciseName: string, mode: PerfMode) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')

  const allMuscles = useMemo(() => {
    const set = new Set<string>()
    for (const ex of exercises) {
      if (ex.muscles) for (const m of ex.muscles) set.add(m)
    }
    return [...set].sort()
  }, [exercises])

  const allCategories = useMemo(() => {
    const set = new Set<string>()
    for (const ex of exercises) {
      if (ex.category) set.add(ex.category)
    }
    return [...set].sort()
  }, [exercises])

  const filtered = useMemo(
    () => filterExercises(exercises, { text: search, muscles: activeMuscles, categories: activeCategories }),
    [exercises, search, activeMuscles, activeCategories],
  )

  function toggleMuscle(m: string) {
    onMusclesChange(
      activeMuscles.includes(m)
        ? activeMuscles.filter((x) => x !== m)
        : [...activeMuscles, m],
    )
  }

  function toggleCategory(c: string) {
    onCategoriesChange(
      activeCategories.includes(c)
        ? activeCategories.filter((x) => x !== c)
        : [...activeCategories, c],
    )
  }

  function clearFilters() {
    onMusclesChange([])
    onCategoriesChange([])
    setSearch('')
  }

  const hasFilters = activeMuscles.length > 0 || activeCategories.length > 0 || search.length > 0

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 px-4 pt-6 pb-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Select exercise</p>
          <input
            autoFocus
            type="text"
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm outline-none focus:border-orange-400 dark:focus:border-orange-500 transition-colors"
          />
          {allMuscles.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
              {allMuscles.map((m) => (
                <button
                  key={m}
                  onClick={() => toggleMuscle(m)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                    activeMuscles.includes(m)
                      ? 'bg-orange-500 text-white'
                      : 'border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          {allCategories.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
              {allCategories.map((c) => (
                <button
                  key={c}
                  onClick={() => toggleCategory(c)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                    activeCategories.includes(c)
                      ? 'bg-orange-500 text-white'
                      : 'border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
        <ul className="overflow-y-auto flex-1 min-h-0">
          {filtered.length === 0 && hasFilters ? (
            <li className="flex flex-col items-center gap-3 py-10 px-4 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No exercises match your filters.</p>
              <button
                onClick={clearFilters}
                className="text-xs font-semibold uppercase tracking-wide text-orange-500 hover:text-orange-600 transition-colors"
              >
                Clear filters
              </button>
            </li>
          ) : (
            filtered.map((ex) => (
              <li key={ex.id} className="flex items-center border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                <button
                  onClick={() => onSelect(ex)}
                  className="flex-1 text-left px-4 py-3 hover:bg-orange-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{ex.name}</p>
                  {ex.category && (
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-600 mt-0.5">{ex.category}</p>
                  )}
                </button>
                <div className="flex items-center gap-1 px-3 shrink-0">
                  <button
                    onClick={() => onInfoClick(ex.id)}
                    title="Exercise info"
                    className="w-6 h-6 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none"
                  >
                    i
                  </button>
                  <button
                    onClick={() => onPerfClick(ex.id, ex.name, 'last')}
                    title="Last session"
                    className="w-6 h-6 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none"
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="6" cy="6" r="5" />
                      <path d="M6 3v3l1.5 1.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onPerfClick(ex.id, ex.name, 'best')}
                    title="Best session"
                    className="w-6 h-6 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none"
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3.5 1.5h5v3.5a2.5 2.5 0 0 1-5 0V1.5z" />
                      <path d="M6 7v1.5" />
                      <path d="M4 9h4" />
                      <path d="M1.5 2.5h2" />
                      <path d="M8.5 2.5h2" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onPerfClick(ex.id, ex.name, 'best60')}
                    title="Best · 60 days"
                    className="w-6 h-6 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none"
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M7 1.5L3.5 6.5H6.5L5 10.5" />
                    </svg>
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
