'use client'

import { ExerciseHistoryPoint } from '@/lib/dal'

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ExerciseHistoryChart({ points }: { points: ExerciseHistoryPoint[] }) {
  const hasWeight = points.some((p) => p.maxWeight != null)
  const hasReps = points.some((p) => p.maxReps != null)

  if (!hasWeight && !hasReps) {
    return (
      <p className="text-sm text-zinc-400 dark:text-zinc-600 text-center py-8">
        No completed workouts with this exercise yet.
      </p>
    )
  }

  if (points.length === 1) {
    return (
      <div className="flex flex-col items-center py-5 gap-1">
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
  const rangeW = maxW - minW

  const rVals = points.map((p) => p.maxReps).filter((v): v is number => v != null)
  const maxR = rVals.length ? Math.max(...rVals) : 0
  const minR = rVals.length ? Math.min(...rVals) : 0
  const rangeR = maxR - minR

  const bothFlat = rangeW === 0 && rangeR === 0
  const yW = (v: number) => rangeW === 0
    ? MT + IH * (bothFlat ? 0.33 : 0.5)
    : MT + (1 - (v - minW) / rangeW) * IH
  const yR = (v: number) => rangeR === 0
    ? MT + IH * (bothFlat ? 0.67 : 0.5)
    : MT + (1 - (v - minR) / rangeR) * IH

  const wPolyline = points.flatMap((p, i) => p.maxWeight != null ? [`${xFor(i).toFixed(1)},${yW(p.maxWeight).toFixed(1)}`] : []).join(' ')
  const rPolyline = points.flatMap((p, i) => p.maxReps != null ? [`${xFor(i).toFixed(1)},${yR(p.maxReps).toFixed(1)}`] : []).join(' ')

  const firstWIdx = points.findIndex((p) => p.maxWeight != null)
  const lastWIdx = points.reduce((acc, p, i) => (p.maxWeight != null ? i : acc), -1)
  const firstRIdx = points.findIndex((p) => p.maxReps != null)
  const lastRIdx = points.reduce((acc, p, i) => (p.maxReps != null ? i : acc), -1)

  const LABEL_GAP = 11
  function nudge(primary: number | null, secondary: number): number {
    if (primary == null) return secondary
    const diff = secondary - primary
    return Math.abs(diff) < LABEL_GAP ? primary + (diff >= 0 ? LABEL_GAP : -LABEL_GAP) : secondary
  }
  const rFirstY = firstRIdx >= 0 ? nudge(firstWIdx >= 0 ? yW(points[firstWIdx].maxWeight!) : null, yR(points[firstRIdx].maxReps!)) : 0
  const rLastY = lastRIdx >= 0 ? nudge(lastWIdx >= 0 ? yW(points[lastWIdx].maxWeight!) : null, yR(points[lastRIdx].maxReps!)) : 0

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
          <text x={xFor(firstRIdx) - 8} y={rFirstY + 4} textAnchor="end" fontSize="9" fill="#71717a">
            {points[firstRIdx].maxReps}
          </text>
        )}
        {lastRIdx >= 0 && lastRIdx !== firstRIdx && (
          <text x={xFor(lastRIdx) + 8} y={rLastY + 4} textAnchor="start" fontSize="9" fill="#71717a">
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
