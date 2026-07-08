'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { filterExercises } from '@/lib/filterExercises'
import { MUSCLE_GROUPS, musclesForGroup, countByGroup } from '@/lib/muscleGroups'

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
  const [openFilter, setOpenFilter] = useState<'muscle' | 'category' | null>(null)
  const [hoverGroup, setHoverGroup] = useState<string | null>(null)
  const filterBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openFilter) return
    function handleClick(e: MouseEvent) {
      if (filterBarRef.current && !filterBarRef.current.contains(e.target as Node)) {
        setOpenFilter(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openFilter])

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

  // Base list narrowed by text + category only — used to count what remains in
  // each muscle group so the group chips show "what's left there".
  const textCategoryFiltered = useMemo(
    () => filterExercises(exercises, { text: search, muscles: [], categories: activeCategories }),
    [exercises, search, activeCategories],
  )

  const groupCounts = useMemo(() => countByGroup(textCategoryFiltered), [textCategoryFiltered])

  // A group chip is "active" when the muscle filter exactly matches its muscles.
  const activeGroupKey = useMemo(() => {
    if (activeMuscles.length === 0) return null
    const active = new Set(activeMuscles)
    const match = MUSCLE_GROUPS.find(
      (g) => g.muscles.length === active.size && g.muscles.every((m) => active.has(m)),
    )
    return match?.key ?? null
  }, [activeMuscles])

  // Hover (desktop) previews a group without committing; falls back to the
  // committed muscle filter otherwise.
  const effectiveMuscles = hoverGroup ? musclesForGroup(hoverGroup) : activeMuscles

  const filtered = useMemo(
    () => filterExercises(exercises, { text: search, muscles: effectiveMuscles, categories: activeCategories }),
    [exercises, search, effectiveMuscles, activeCategories],
  )

  function toggleGroup(key: string) {
    setHoverGroup(null)
    if (activeGroupKey === key) {
      onMusclesChange([])
    } else {
      onMusclesChange(musclesForGroup(key))
    }
  }

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
    setHoverGroup(null)
  }

  const hasFilters = activeMuscles.length > 0 || activeCategories.length > 0 || search.length > 0
  // The visible list uses effectiveMuscles (incl. hover preview); the empty-state
  // message must key off the same set so results never blank out silently.
  const listIsFiltered = hasFilters || effectiveMuscles.length > 0

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
          {/* Muscle-group chips — hover (desktop) previews, tap selects. Count = what's left. */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
            {MUSCLE_GROUPS.map((g) => {
              const count = groupCounts[g.key] ?? 0
              const isActive = activeGroupKey === g.key
              return (
                <button
                  key={g.key}
                  onClick={() => toggleGroup(g.key)}
                  onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHoverGroup(g.key) }}
                  onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHoverGroup((h) => (h === g.key ? null : h)) }}
                  disabled={count === 0 && !isActive}
                  className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide transition-colors ${
                    isActive
                      ? 'bg-orange-500 text-white'
                      : count === 0
                      ? 'border border-zinc-100 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700'
                      : 'border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-orange-400 hover:text-orange-500'
                  }`}
                >
                  {g.label}
                  <span className={`rounded-full px-1 ${isActive ? 'bg-white/30' : 'text-zinc-400 dark:text-zinc-500'}`}>{count}</span>
                </button>
              )
            })}
          </div>
          {/* Filter type buttons + dropdowns */}
          <div ref={filterBarRef} className="relative">
            <div className="flex items-center gap-2">
              {allMuscles.length > 0 && (
                <button
                  onClick={() => setOpenFilter(openFilter === 'muscle' ? null : 'muscle')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide transition-colors ${
                    activeMuscles.length > 0
                      ? 'bg-orange-500 text-white'
                      : openFilter === 'muscle'
                      ? 'border border-orange-400 text-orange-500 dark:border-orange-500'
                      : 'border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  Muscle
                  {activeMuscles.length > 0 && (
                    <span className="ml-0.5 bg-white/30 rounded-full px-1">{activeMuscles.length}</span>
                  )}
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`transition-transform ${openFilter === 'muscle' ? 'rotate-180' : ''}`}>
                    <path d="M1 2.5l3 3 3-3" />
                  </svg>
                </button>
              )}
              {allCategories.length > 0 && (
                <button
                  onClick={() => setOpenFilter(openFilter === 'category' ? null : 'category')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide transition-colors ${
                    activeCategories.length > 0
                      ? 'bg-orange-500 text-white'
                      : openFilter === 'category'
                      ? 'border border-orange-400 text-orange-500 dark:border-orange-500'
                      : 'border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  Category
                  {activeCategories.length > 0 && (
                    <span className="ml-0.5 bg-white/30 rounded-full px-1">{activeCategories.length}</span>
                  )}
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`transition-transform ${openFilter === 'category' ? 'rotate-180' : ''}`}>
                    <path d="M1 2.5l3 3 3-3" />
                  </svg>
                </button>
              )}
              {hasFilters && (
                <button
                  onClick={() => { clearFilters(); setOpenFilter(null) }}
                  className="ml-auto text-xs font-semibold uppercase tracking-wide text-zinc-400 hover:text-orange-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Muscle dropdown */}
            {openFilter === 'muscle' && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg z-10 overflow-y-auto max-h-56 py-1">
                {allMuscles.map((m) => (
                  <button
                    key={m}
                    onClick={() => toggleMuscle(m)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm capitalize transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                      activeMuscles.includes(m) ? 'text-orange-500 font-semibold' : 'text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {m}
                    {activeMuscles.includes(m) && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Category dropdown */}
            {openFilter === 'category' && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg z-10 overflow-y-auto max-h-56 py-1">
                {allCategories.map((c) => (
                  <button
                    key={c}
                    onClick={() => toggleCategory(c)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm capitalize transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                      activeCategories.includes(c) ? 'text-orange-500 font-semibold' : 'text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {c}
                    {activeCategories.includes(c) && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <ul className="overflow-y-auto flex-1 min-h-0">
          {filtered.length === 0 && listIsFiltered ? (
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
