'use client'

import { useState } from 'react'

export type SlimExercise = {
  id: number
  name: string
  category: string | null
  equipment: string | null
}

export default function ExercisePickerSheet({
  exercises,
  onSelect,
  onInfoClick,
  onClose,
}: {
  exercises: SlimExercise[]
  onSelect: (exercise: SlimExercise) => void
  onInfoClick: (exerciseId: number) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')

  const filtered = search
    ? exercises.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : exercises

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 px-4 pt-6 pb-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">Select exercise</p>
          <input
            autoFocus
            type="text"
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm outline-none focus:border-orange-400 dark:focus:border-orange-500 transition-colors"
          />
        </div>
        <ul className="overflow-y-auto flex-1">
          {filtered.slice(0, 50).map((ex) => (
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
              <button
                onClick={() => onInfoClick(ex.id)}
                title="Exercise info"
                className="shrink-0 mx-3 w-6 h-6 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none"
              >
                i
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
