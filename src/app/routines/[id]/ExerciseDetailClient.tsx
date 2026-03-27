'use client'

import { useState } from 'react'
import { fetchExerciseHistory } from '@/app/actions/exercises'
import { ExerciseHistoryPoint } from '@/lib/dal'
import { ExerciseHistoryChart } from '@/components/ExerciseHistoryChart'

type Tab = 'info' | 'history'

type Exercise = {
  id: number
  name: string
  category: string | null
  equipment: string | null
  muscles: string[] | null
  muscles_secondary: string[] | null
  images: string[] | null
  instructions: string[] | null
}

export default function ExerciseDetailClient({ exercise }: { exercise: Exercise }) {
  const [tab, setTab] = useState<Tab>('info')
  const [history, setHistory] = useState<ExerciseHistoryPoint[] | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  function handleTabChange(t: Tab) {
    setTab(t)
    if (t === 'history' && history === null) {
      setLoadingHistory(true)
      fetchExerciseHistory(exercise.id).then((data) => {
        setHistory(data ?? [])
        setLoadingHistory(false)
      })
    }
  }

  const images = exercise.images ?? []

  return (
    <>
      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 -mx-6 px-6">
        {(['info', 'history'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            className={`py-2.5 mr-6 text-sm font-medium capitalize transition-colors border-b-2 ${
              tab === t
                ? 'text-zinc-900 dark:text-white border-orange-500'
                : 'text-zinc-400 dark:text-zinc-600 border-transparent hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="flex flex-col gap-6">
          {images[0] && (
            <img
              src={images[0]}
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
          {(exercise.muscles?.length ?? 0) > 0 && (
            <div>
              <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Primary muscles</h2>
              <p className="text-sm text-zinc-900 dark:text-white">{exercise.muscles!.join(', ')}</p>
            </div>
          )}
          {(exercise.muscles_secondary?.length ?? 0) > 0 && (
            <div>
              <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Secondary muscles</h2>
              <p className="text-sm text-zinc-900 dark:text-white">{exercise.muscles_secondary!.join(', ')}</p>
            </div>
          )}
          {(exercise.instructions?.length ?? 0) > 0 && (
            <div>
              <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3">Instructions</h2>
              <ol className="flex flex-col gap-3">
                {exercise.instructions!.map((step: string, i: number) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-xs font-bold text-zinc-400 dark:text-zinc-600 mt-0.5 shrink-0">{i + 1}</span>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">{step}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="py-4">
          {loadingHistory ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 rounded-full border-2 border-zinc-300 border-t-orange-500 dark:border-zinc-700 dark:border-t-orange-500 animate-spin" />
            </div>
          ) : (
            <ExerciseHistoryChart points={history ?? []} />
          )}
        </div>
      )}
    </>
  )
}
