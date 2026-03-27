import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getExercise } from '@/lib/dal'

export default async function ExercisePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const exercise = await getExercise(Number(id))
  if (!exercise) notFound()

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="flex items-center gap-4 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <Link
          href="/routines"
          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors text-sm"
        >
          ← Back
        </Link>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">{exercise.name}</h1>
      </header>

      <main className="max-w-lg mx-auto px-6 py-6 flex flex-col gap-6">
        {exercise.images?.[0] && (
          <img
            src={exercise.images[0]}
            alt={exercise.name}
            className="w-full rounded-xl object-cover aspect-video bg-zinc-100 dark:bg-zinc-900"
          />
        )}

        <div className="flex gap-2 flex-wrap">
          {exercise.category && (
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {exercise.category}
            </span>
          )}
          {exercise.equipment && (
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {exercise.equipment}
            </span>
          )}
        </div>

        {exercise.muscles?.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Primary muscles
            </h2>
            <p className="text-sm text-zinc-900 dark:text-white">
              {exercise.muscles.join(', ')}
            </p>
          </div>
        )}

        {exercise.muscles_secondary?.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Secondary muscles
            </h2>
            <p className="text-sm text-zinc-900 dark:text-white">
              {exercise.muscles_secondary.join(', ')}
            </p>
          </div>
        )}

        {exercise.instructions?.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3">
              Instructions
            </h2>
            <ol className="flex flex-col gap-3">
              {exercise.instructions.map((step: string, i: number) => (
                <li key={i} className="flex gap-3">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-600 mt-0.5 shrink-0">
                    {i + 1}
                  </span>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </main>
    </div>
  )
}
