'use client'

import { useState } from 'react'
import { fetchExerciseHistory } from '@/app/actions/exercises'
import { ExerciseHistoryPoint } from '@/lib/dal'

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

type Tab = 'info' | 'history'

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function HistoryChart({ points }: { points: ExerciseHistoryPoint[] }) {
  const hasWeight = points.some((p) => p.maxWeight != null)
  const hasReps = points.some((p) => p.maxReps != null)

  if (!hasWeight && !hasReps) {
    return (
      <p className="text-xs text-zinc-400 dark:text-zinc-600 text-center py-6">
        No completed workouts with this exercise yet.
      </p>
    )
  }

  if (points.length === 1) {
    return (
      <div className="flex flex-col items-center py-4 gap-1">
        {points[0].maxWeight != null && (
          <span className="text-2xl font-bold text-zinc-900 dark:text-white">{points[0].maxWeight} kg</span>
        )}
        {points[0].maxReps != null && (
          <span className="text-base font-semibold text-zinc-500 dark:text-zinc-400">{points[0].maxReps} reps</span>
        )}
        <span className="text-xs text-zinc-400 dark:text-zinc-600">{fmtDate(points[0].date)}</span>
      </div>
    )
  }

  const W = 300, H = 140
  const ML = 36, MR = 28, MT = 10, MB = 22
  const IW = W - ML - MR
  const IH = H - MT - MB
  const n = points.length
  const xFor = (i: number) => ML + (i / (n - 1)) * IW

  const wVals = points.map((p) => p.maxWeight).filter((v): v is number => v != null)
  const maxW = wVals.length ? Math.max(...wVals) : 0
  const minW = wVals.length ? Math.min(...wVals) : 0
  const rangeW = maxW - minW || 1
  const yW = (v: number) => MT + (1 - (v - minW) / rangeW) * IH

  const rVals = points.map((p) => p.maxReps).filter((v): v is number => v != null)
  const maxR = rVals.length ? Math.max(...rVals) : 0
  const minR = rVals.length ? Math.min(...rVals) : 0
  const rangeR = maxR - minR || 1
  const yR = (v: number) => MT + (1 - (v - minR) / rangeR) * IH

  const wPolyline = points.flatMap((p, i) => p.maxWeight != null ? [`${xFor(i).toFixed(1)},${yW(p.maxWeight).toFixed(1)}`] : []).join(' ')
  const rPolyline = points.flatMap((p, i) => p.maxReps != null ? [`${xFor(i).toFixed(1)},${yR(p.maxReps).toFixed(1)}`] : []).join(' ')

  // Indices of first/last non-null point for each series
  const firstWIdx = points.findIndex((p) => p.maxWeight != null)
  const lastWIdx = points.reduce((acc, p, i) => (p.maxWeight != null ? i : acc), -1)
  const firstRIdx = points.findIndex((p) => p.maxReps != null)
  const lastRIdx = points.reduce((acc, p, i) => (p.maxReps != null ? i : acc), -1)

  return (
    <div className="flex flex-col gap-3">
      {/* Legend */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <svg width="14" height="6" aria-hidden="true">
            <line x1="0" y1="3" x2="14" y2="3" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="text-xs text-zinc-400 dark:text-zinc-600">Weight (kg)</span>
        </div>
        {hasReps && (
          <div className="flex items-center gap-1.5">
            <svg width="14" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="14" y2="3" stroke="#71717a" strokeWidth="1.5" strokeDasharray="3,2" strokeLinecap="round" />
            </svg>
            <span className="text-xs text-zinc-400 dark:text-zinc-600">Max reps</span>
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
        {/* Horizontal grid lines */}
        {[MT, MT + IH / 2, MT + IH].map((y, i) => (
          <line key={i} x1={ML} y1={y} x2={W - MR} y2={y}
            className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="0.5" strokeDasharray="3,3"
          />
        ))}

        {/* Weight dot labels — sit beside each dot */}
        {firstWIdx >= 0 && (
          <text x={xFor(firstWIdx) - 8} y={yW(points[firstWIdx].maxWeight!) + 4} textAnchor="end" fontSize="9" fill="#f97316">
            {points[firstWIdx].maxWeight}
          </text>
        )}
        {lastWIdx >= 0 && lastWIdx !== firstWIdx && (
          <text x={xFor(lastWIdx) + 8} y={yW(points[lastWIdx].maxWeight!) + 4} textAnchor="start" fontSize="9" fill="#f97316">
            {points[lastWIdx].maxWeight}
          </text>
        )}

        {/* Reps dot labels — sit beside each dot */}
        {firstRIdx >= 0 && (
          <text x={xFor(firstRIdx) - 8} y={yR(points[firstRIdx].maxReps!) + 4} textAnchor="end" fontSize="9" fill="#71717a">
            {points[firstRIdx].maxReps}
          </text>
        )}
        {lastRIdx >= 0 && lastRIdx !== firstRIdx && (
          <text x={xFor(lastRIdx) + 8} y={yR(points[lastRIdx].maxReps!) + 4} textAnchor="start" fontSize="9" fill="#71717a">
            {points[lastRIdx].maxReps}
          </text>
        )}

        {/* Weight line (solid orange) */}
        {hasWeight && (
          <>
            <polyline points={wPolyline} fill="none" stroke="#f97316" strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => p.maxWeight != null
              ? <circle key={i} cx={xFor(i)} cy={yW(p.maxWeight)} r="3" fill="#f97316" />
              : null
            )}
          </>
        )}

        {/* Reps line (dashed zinc) */}
        {hasReps && (
          <>
            <polyline points={rPolyline} fill="none" stroke="#71717a" strokeWidth="1.5"
              strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4,2" />
            {points.map((p, i) => p.maxReps != null
              ? <circle key={i} cx={xFor(i)} cy={yR(p.maxReps)} r="2.5" fill="#71717a" />
              : null
            )}
          </>
        )}

        {/* X-axis: first and last date */}
        <text x={ML} y={H - 4} textAnchor="start" fontSize="8" fill="#a1a1aa">
          {fmtDate(points[0].date)}
        </text>
        <text x={W - MR} y={H - 4} textAnchor="end" fontSize="8" fill="#a1a1aa">
          {fmtDate(points[points.length - 1].date)}
        </text>
      </svg>
    </div>
  )
}

export default function ExerciseInfoModal({
  exercise,
  onClose,
}: {
  exercise: Exercise
  onClose: () => void
}) {
  const [imgIndex, setImgIndex] = useState(0)
  const [tab, setTab] = useState<Tab>('info')
  const [history, setHistory] = useState<ExerciseHistoryPoint[] | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  const images = exercise.images ?? []
  const instructions = exercise.instructions ?? []
  const muscles = exercise.muscles ?? []
  const musclesSecondary = exercise.muscles_secondary ?? []

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

        {/* Tabs */}
        <div className="flex border-b border-zinc-100 dark:border-zinc-800">
          {(['info', 'history'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors ${
                tab === t
                  ? 'text-zinc-900 dark:text-white border-b-2 border-zinc-900 dark:border-white'
                  : 'text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          {tab === 'info' && (
            <>
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
                {exercise.equipment && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1">
                      Equipment
                    </p>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 capitalize">{exercise.equipment}</p>
                  </div>
                )}

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
            </>
          )}

          {tab === 'history' && (
            <div className="px-5 py-4 flex flex-col gap-4">
              {loadingHistory ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white animate-spin" />
                </div>
              ) : (
                <>
                  <HistoryChart points={history ?? []} />

                  {(history?.length ?? 0) > 0 && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-600 text-center">
                      Last 90 days · completed workouts only
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
