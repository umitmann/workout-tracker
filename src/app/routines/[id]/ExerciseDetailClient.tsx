'use client'

import { useState } from 'react'
import { fetchExerciseHistory } from '@/app/actions/exercises'
import { ExerciseHistoryPoint } from '@/lib/dal'

type Tab = 'info' | 'history'

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function HistoryChart({ points }: { points: ExerciseHistoryPoint[] }) {
  const hasWeight = points.some((p) => p.maxWeight != null)
  const hasReps = points.some((p) => p.maxReps != null)

  if (!hasWeight && !hasReps) {
    return (
      <p className="text-sm text-zinc-400 dark:text-zinc-600 text-center py-10">
        No completed workouts with this exercise yet.
      </p>
    )
  }

  if (points.length === 1) {
    return (
      <div className="flex flex-col items-center py-6 gap-1">
        {points[0].maxWeight != null && (
          <span className="text-3xl font-bold text-zinc-900 dark:text-white">{points[0].maxWeight} kg</span>
        )}
        {points[0].maxReps != null && (
          <span className="text-lg font-semibold text-zinc-500 dark:text-zinc-400">{points[0].maxReps} reps</span>
        )}
        <span className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">{fmtDate(points[0].date)}</span>
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

  const firstWIdx = points.findIndex((p) => p.maxWeight != null)
  const lastWIdx = points.reduce((acc, p, i) => (p.maxWeight != null ? i : acc), -1)
  const firstRIdx = points.findIndex((p) => p.maxReps != null)
  const lastRIdx = points.reduce((acc, p, i) => (p.maxReps != null ? i : acc), -1)

  return (
    <div className="flex flex-col gap-3">
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
        {[MT, MT + IH / 2, MT + IH].map((y, i) => (
          <line key={i} x1={ML} y1={y} x2={W - MR} y2={y}
            className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="0.5" strokeDasharray="3,3"
          />
        ))}
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
        <text x={ML} y={H - 4} textAnchor="start" fontSize="8" fill="#a1a1aa">{fmtDate(points[0].date)}</text>
        <text x={W - MR} y={H - 4} textAnchor="end" fontSize="8" fill="#a1a1aa">{fmtDate(points[points.length - 1].date)}</text>
      </svg>

      <p className="text-xs text-zinc-400 dark:text-zinc-600 text-center">Last 90 days · completed workouts only</p>
    </div>
  )
}

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
            <HistoryChart points={history ?? []} />
          )}
        </div>
      )}
    </>
  )
}
