'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { filterExercises } from '@/lib/filterExercises'
import { MUSCLE_GROUPS, musclesForGroup, countByGroup } from '@/lib/muscleGroups'
import Modal from '@/components/Modal'

export type SlimExercise = {
  id: number
  name: string
  category: string | null
  equipment: string | null
  muscles: string[] | null
  muscles_secondary?: string[] | null
  muscles_detailed?: string[] | null
  muscles_secondary_detailed?: string[] | null
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
  loading = false,
  loadError = false,
  onRetry,
  onClose,
}: {
  exercises: SlimExercise[]
  activeMuscles: string[]
  onMusclesChange: (muscles: string[]) => void
  activeCategories: string[]
  onCategoriesChange: (categories: string[]) => void
  onSelect: (exercise: SlimExercise) => void
  onInfoClick: (exerciseId: number) => void
  onPerfClick: (exerciseId: number, exerciseName: string, mode: PerfMode, category: string | null) => void
  loading?: boolean
  loadError?: boolean
  onRetry?: () => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
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
    setOpenFilter(null)
  }

  const hasFilters = activeMuscles.length > 0 || activeCategories.length > 0 || search.length > 0
  // The visible list uses effectiveMuscles (incl. hover preview); the empty-state
  // message must key off the same set so results never blank out silently.
  const listIsFiltered = hasFilters || effectiveMuscles.length > 0

  return (
    <Modal
      title="Select exercise"
      onClose={onClose}
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-start sm:px-4 sm:pb-4 sm:pt-6"
      panelClassName="flex h-[min(92dvh,48rem)] w-full max-w-lg flex-col rounded-t-[1.75rem] bg-white shadow-2xl outline-none dark:bg-zinc-900 sm:rounded-2xl"
    >
      <>
        <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 pb-3 pt-4 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400">Exercise library</p>
              <h2 className="mt-0.5 text-xl font-black text-zinc-950 dark:text-white">Select exercise</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close exercise picker" className="grid min-h-12 min-w-12 place-items-center rounded-full text-2xl text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">×</button>
          </div>

          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Search exercises</span>
              <input
                type="search"
                autoFocus
                placeholder="Search exercises…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-12 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 text-base text-zinc-950 outline-none placeholder:text-zinc-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-400"
              />
            </label>
            <button
              type="button"
              aria-expanded={showFilters}
              onClick={() => { setShowFilters((visible) => !visible); setOpenFilter(null) }}
              className={`min-h-12 shrink-0 rounded-xl border px-4 text-sm font-bold ${showFilters || activeMuscles.length > 0 || activeCategories.length > 0 ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300' : 'border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200'}`}
            >
              Filters{activeMuscles.length + activeCategories.length > 0 ? ` (${activeMuscles.length + activeCategories.length})` : ''}
            </button>
          </div>

          {showFilters && (
            <div ref={filterBarRef} className="flex flex-col gap-2 rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-800/70">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {MUSCLE_GROUPS.map((g) => {
                  const count = groupCounts[g.key] ?? 0
                  const isActive = activeGroupKey === g.key
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => toggleGroup(g.key)}
                      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHoverGroup(g.key) }}
                      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHoverGroup((h) => (h === g.key ? null : h)) }}
                      disabled={count === 0 && !isActive}
                      className={`flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-bold uppercase tracking-wide ${isActive ? 'border-orange-500 bg-orange-500 text-white' : 'border-zinc-300 text-zinc-700 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200'}`}
                    >
                      {g.label} <span className={isActive ? 'text-white/80' : 'text-zinc-500 dark:text-zinc-400'}>{count}</span>
                    </button>
                  )
                })}
              </div>

              <div className="flex gap-2">
                {allMuscles.length > 0 && (
                  <button type="button" onClick={() => setOpenFilter(openFilter === 'muscle' ? null : 'muscle')} className="min-h-11 rounded-xl border border-zinc-300 px-3 text-sm font-bold text-zinc-700 dark:border-zinc-600 dark:text-zinc-200">
                    Muscles{activeMuscles.length > 0 ? ` (${activeMuscles.length})` : ''}
                  </button>
                )}
                {allCategories.length > 0 && (
                  <button type="button" onClick={() => setOpenFilter(openFilter === 'category' ? null : 'category')} className="min-h-11 rounded-xl border border-zinc-300 px-3 text-sm font-bold text-zinc-700 dark:border-zinc-600 dark:text-zinc-200">
                    Category{activeCategories.length > 0 ? ` (${activeCategories.length})` : ''}
                  </button>
                )}
                {(activeMuscles.length > 0 || activeCategories.length > 0) && (
                  <button type="button" onClick={clearFilters} className="ml-auto min-h-11 px-2 text-sm font-bold text-orange-700 dark:text-orange-300">Clear</button>
                )}
              </div>

              {openFilter && (
                <div className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
                  {(openFilter === 'muscle' ? allMuscles : allCategories).map((value) => {
                    const selected = openFilter === 'muscle' ? activeMuscles.includes(value) : activeCategories.includes(value)
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => openFilter === 'muscle' ? toggleMuscle(value) : toggleCategory(value)}
                        className={`min-h-11 rounded-lg px-3 text-left text-sm font-semibold capitalize ${selected ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300' : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800'}`}
                      >
                        {selected ? '✓ ' : ''}{value}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <p role="status" className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">{loading ? 'Loading…' : `${filtered.length} exercise${filtered.length === 1 ? '' : 's'}`}</p>
        </div>
        <ul className="overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <li role="status" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <span className="size-8 animate-spin rounded-full border-2 border-zinc-300 border-t-orange-500" aria-hidden="true" />
              <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">Loading exercise library…</p>
            </li>
          ) : loadError ? (
            <li role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">The exercise library could not load.</p>
              <button type="button" onClick={onRetry} className="min-h-11 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white">Try again</button>
            </li>
          ) : filtered.length === 0 && listIsFiltered ? (
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
              <li key={ex.id} className="flex min-h-14 items-stretch border-b border-zinc-200 dark:border-zinc-800 last:border-0">
                <button
                  onClick={() => onSelect(ex)}
                  className="min-h-12 min-w-0 flex-1 px-4 py-3 text-left transition-colors hover:bg-orange-50 dark:hover:bg-zinc-800"
                >
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{ex.name}</p>
                  {ex.category && (
                    <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{ex.category}</p>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onInfoClick(ex.id)}
                  aria-label={`Exercise details: ${ex.name}`}
                  title="Exercise info"
                  className="grid min-h-12 min-w-12 place-items-center self-center rounded-xl text-lg font-bold text-zinc-500 transition hover:bg-zinc-100 hover:text-orange-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  ⓘ
                </button>
              </li>
            ))
          )}
        </ul>
      </>
    </Modal>
  )
}
