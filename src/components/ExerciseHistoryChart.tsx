'use client'

import type { ExerciseHistoryPoint } from '@/lib/dal'
import {
  AXIS_LABEL_CLASS,
  LEGEND_TEXT_CLASS,
  WEIGHT_STROKE,
  buildChartLayout,
  buildChartSummary,
  fmtDate,
} from '@/lib/historyChartLayout'

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

  const layout = buildChartLayout(points)
  const summary = buildChartSummary(points)
  const titleId = 'exercise-history-chart-title'
  const descId = 'exercise-history-chart-desc'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <svg width="14" height="6" aria-hidden="true">
            <line x1="0" y1="3" x2="14" y2="3" stroke={WEIGHT_STROKE} strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className={`text-xs ${LEGEND_TEXT_CLASS}`}>Weight (kg)</span>
        </div>
        {hasReps && (
          <div className={`flex items-center gap-1.5 ${layout.repsClassName}`}>
            <svg width="14" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="14" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,2" strokeLinecap="round" />
            </svg>
            <span className="text-xs">Max reps</span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="w-full overflow-visible"
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
      >
        <title id={titleId}>Exercise history chart</title>
        <desc id={descId}>{summary}</desc>
        {layout.gridLines.map((g, i) => (
          <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
            className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="0.5" strokeDasharray="3,3"
          />
        ))}
        {layout.weightLabels.map((l, i) => (
          <text key={i} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={l.fontSize} fill={l.fill}>
            {l.value}
          </text>
        ))}
        {layout.repsLabels.map((l, i) => (
          <text key={i} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={l.fontSize} fill={l.fill} className={l.className}>
            {l.value}
          </text>
        ))}
        {hasWeight && (
          <>
            <polyline points={layout.weightPolyline} fill="none" stroke={WEIGHT_STROKE} strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" />
            {layout.weightDots.map((d, i) => (
              <circle key={i} cx={d.cx} cy={d.cy} r="3" fill={WEIGHT_STROKE} />
            ))}
          </>
        )}
        {hasReps && (
          <g className={layout.repsClassName}>
            <polyline points={layout.repsPolyline} fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4,2" />
            {layout.repsDots.map((d, i) => (
              <circle key={i} cx={d.cx} cy={d.cy} r="2.5" fill="currentColor" />
            ))}
          </g>
        )}
        {layout.xAxisLabels.map((l, i) => (
          <text key={i} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={l.fontSize} className={AXIS_LABEL_CLASS}>
            {l.text}
          </text>
        ))}
      </svg>

      <p className="text-xs text-zinc-400 dark:text-zinc-600 text-center">Last 90 days · completed workouts only</p>
    </div>
  )
}
