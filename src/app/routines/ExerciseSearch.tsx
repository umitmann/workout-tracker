'use client'

export default function ExerciseSearch({
  categories,
  query,
  category,
  onQueryChange,
  onCategoryChange,
}: {
  categories: string[]
  query: string
  category: string
  onQueryChange: (query: string) => void
  onCategoryChange: (category: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <label>
        <span className="sr-only">Search exercises</span>
        <input
          type="search"
          placeholder="Search exercises..."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 outline-none placeholder:text-zinc-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-400 sm:text-sm"
        />
      </label>
      <div className="scrollbar-hide flex min-w-0 gap-2 overflow-x-auto pb-1" aria-label="Exercise categories">
        <button
          type="button"
          aria-pressed={!category}
          onClick={() => onCategoryChange('')}
          className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold transition-colors ${
            !category
              ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
          }`}
        >
          All
        </button>
        {categories.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={category === value}
            onClick={() => onCategoryChange(value)}
            className={`min-h-11 max-w-[14rem] shrink-0 truncate rounded-full px-4 text-sm font-bold transition-colors ${
              category === value
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
            }`}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  )
}
