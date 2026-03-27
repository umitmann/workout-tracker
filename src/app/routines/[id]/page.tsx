import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getExercise } from '@/lib/dal'
import ExerciseDetailClient from './ExerciseDetailClient'

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
        <ExerciseDetailClient exercise={exercise} />
      </main>
    </div>
  )
}
