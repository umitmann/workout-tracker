'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

export default function ExerciseSearch({ categories }: { categories: string[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [category, setCategory] = useState(params.get('category') ?? '')

  function update(q: string, cat: string) {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (cat) p.set('category', cat)
    router.push(`/routines?${p.toString()}`)
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        placeholder="Search exercises..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          update(e.target.value, category)
        }}
        className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
      />
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => { setCategory(''); update(query, '') }}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !category
              ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => { setCategory(cat); update(query, cat) }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              category === cat
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
    </div>
  )
}
