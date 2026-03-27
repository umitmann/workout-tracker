'use client'

import { useState } from 'react'

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

export default function ExerciseInfoModal({
  exercise,
  onClose,
}: {
  exercise: Exercise
  onClose: () => void
}) {
  const [imgIndex, setImgIndex] = useState(0)
  const images = exercise.images ?? []
  const instructions = exercise.instructions ?? []
  const muscles = exercise.muscles ?? []
  const musclesSecondary = exercise.muscles_secondary ?? []

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">{exercise.name}</h2>
            {exercise.category && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 capitalize">{exercise.category}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          {/* Image carousel */}
          {images.length > 0 && (
            <div className="relative bg-zinc-100 dark:bg-zinc-800">
              <img
                src={images[imgIndex]}
                alt={`${exercise.name} illustration`}
                className="w-full object-cover max-h-56"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
              {images.length > 1 && (
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setImgIndex(i)}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        i === imgIndex
                          ? 'bg-zinc-900 dark:bg-white'
                          : 'bg-zinc-400 dark:bg-zinc-600'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="px-5 py-4 flex flex-col gap-4">
            {/* Equipment */}
            {exercise.equipment && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1">
                  Equipment
                </p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 capitalize">{exercise.equipment}</p>
              </div>
            )}

            {/* Primary muscles */}
            {muscles.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1">
                  Primary Muscles
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {muscles.map((m) => (
                    <span
                      key={m}
                      className="rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-2.5 py-0.5 text-xs capitalize"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Secondary muscles */}
            {musclesSecondary.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1">
                  Secondary Muscles
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {musclesSecondary.map((m) => (
                    <span
                      key={m}
                      className="rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 px-2.5 py-0.5 text-xs capitalize"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Instructions */}
            {instructions.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">
                  Instructions
                </p>
                <ol className="flex flex-col gap-2">
                  {instructions.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs flex items-center justify-center font-medium">
                        {i + 1}
                      </span>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
