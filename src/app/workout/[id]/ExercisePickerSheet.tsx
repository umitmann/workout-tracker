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
      className="fixed inset-0 bg-black/50 flex items-end z-50"
      onClick={onClose}
    >
      <div
        className="w-full bg-white dark:bg-zinc-900 rounded-t-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <input
            autoFocus
            type="text"
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm outline-none"
          />
        </div>
        <ul className="overflow-y-auto flex-1">
          {filtered.slice(0, 50).map((ex) => (
            <li key={ex.id} className="flex items-center border-b border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => onSelect(ex)}
                className="flex-1 text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{ex.name}</p>
                {ex.category && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-0.5">{ex.category}</p>
                )}
              </button>
              <button
                onClick={() => onInfoClick(ex.id)}
                title="Exercise info"
                className="shrink-0 mx-3 w-6 h-6 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-zinc-500 dark:hover:border-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors text-xs font-medium flex items-center justify-center leading-none"
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
