'use client'

import { LastExercisePerformance } from '@/lib/dal'

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export default function LastPerfModal({
  exerciseName,
  data,
  loading,
  onClose,
}: {
  exerciseName: string
  data: LastExercisePerformance | null
  loading: boolean
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-5 flex flex-col gap-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-0.5">
              Last session
            </p>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">{exerciseName}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <div className="w-7 h-7 rounded-full border-2 border-zinc-300 border-t-orange-500 dark:border-zinc-700 dark:border-t-orange-500 animate-spin" />
          </div>
        ) : data ? (
          <>
            <p className="text-xs text-zinc-400 dark:text-zinc-600">{fmtDate(data.date)}</p>
            <div className="flex gap-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 leading-none mb-1">
                  Weight
                </p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                  {data.maxWeight != null ? `${data.maxWeight} kg` : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 leading-none mb-1">
                  Max reps
                </p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                  {data.maxReps != null ? data.maxReps : '—'}
                </p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-600">
            No completed workouts with this exercise yet.
          </p>
        )}
      </div>
    </div>
  )
}
