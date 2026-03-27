import Link from 'next/link'
import { getAllExercises } from '@/lib/dal'
import ExerciseSearch from './ExerciseSearch'

export default async function RoutinesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>
}) {
  const { q, category } = await searchParams
  const exercises = await getAllExercises()

  const filtered = exercises.filter((e) => {
    const matchesQuery = !q || e.name.toLowerCase().includes(q.toLowerCase())
    const matchesCategory = !category || e.category === category
    return matchesQuery && matchesCategory
  })

  const categories = [
    ...new Set(exercises.map((e) => e.category).filter(Boolean)),
  ] as string[]

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="flex items-center gap-4 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <Link
          href="/dashboard"
          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors text-sm"
        >
          ← Back
        </Link>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Exercises</h1>
      </header>

      <main className="max-w-lg mx-auto px-6 py-6 flex flex-col gap-4">
        <ExerciseSearch categories={categories} />

        <p className="text-sm text-zinc-500 dark:text-zinc-400">{filtered.length} exercises</p>

        <ul className="flex flex-col gap-2">
          {filtered.map((e) => (
            <li key={e.id}>
              <Link
                href={`/routines/${e.id}`}
                className="flex items-center justify-between rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{e.name}</p>
                  {e.category && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{e.category}</p>
                  )}
                </div>
                {e.equipment && (
                  <span className="text-xs text-zinc-400 dark:text-zinc-600">{e.equipment}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
