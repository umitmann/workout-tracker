// Pure SVG-geometry/format/style helpers for ExerciseHistoryChart.tsx
// (finding M11, WP-16). Extracted so the layout math and legibility
// constants (font sizes, stroke colors, AA-compliant text classes) can be
// unit-tested without React/DOM — the component is a thin renderer over
// this module's output. No React, no DOM.

export type HistoryPoint = {
  date: string
  maxWeight: number | null
  maxReps: number | null
}

export function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Legibility constants (finding M11) ────────────────────────────────────
// The chart's outer <svg> uses viewBox="0 0 300 140" stretched to `w-full`;
// on a typical mobile container (~320-380px wide) that's roughly a 1:1 to
// 1.25:1 user-unit-to-CSS-px ratio, so SVG fontSize values need to be >= 11
// to read as >= 11 CSS px. The previous fontSize={9}/{8} rendered as
// unreadable ~7-8px text on phones.
export const LABEL_FONT_SIZE = 12 // data-point value labels (§5.3/§5.4)
export const AXIS_FONT_SIZE = 11 // x-axis first/last date labels (§5.5)

// Weight line stays orange (§5.2, unregressed). Contrast reality (WCAG
// relative luminance): 6.32:1 on dark:bg-zinc-900 (passes AA) but only
// 2.80:1 on the white light-mode panel (fails AA text and 3:1 graphics).
// Accepted pre-existing debt: this orange is the brand series color the
// checklist pins; making light mode AA needs a scheme-aware darker orange
// (like the reps series' currentColor approach) — tracked, not done here.
export const WEIGHT_STROKE = '#f97316'

// Reps line/labels: no single hex clears WCAG AA (4.5:1 text / 3:1 marks)
// in *both* color schemes — zinc-500 (#71717a) is 4.83:1 on white (passes)
// but only 3.67:1 on dark:bg-zinc-900 (#18181b, fails); zinc-400 (#a1a1aa)
// is 6.91:1 on zinc-900 (passes) but only 2.56:1 on white (fails). So the
// reps stroke/fill must be `currentColor`, driven by this Tailwind class
// applied to the SVG (className is inherited by children as `color`).
export const REPS_STROKE_CLASS = 'text-zinc-500 dark:text-zinc-400'
export const REPS_STROKE = 'currentColor'

// Legend/caption text classes: dark-mode leg must not be the AA-failing
// zinc-500; use zinc-400 (passes 6.9:1 on dark:bg-zinc-900) to match the
// reps-line color grouping, light-mode leg keeps zinc-500 (passes on white).
export const LEGEND_TEXT_CLASS = 'text-zinc-500 dark:text-zinc-400'
export const AXIS_LABEL_CLASS = 'fill-zinc-500 dark:fill-zinc-400'

const LABEL_GAP = 11

type ValueLabel = {
  x: number
  y: number
  value: number
  fill: string
  className?: string
  fontSize: number
  anchor: 'start' | 'end'
}
type AxisLabel = { x: number; y: number; text: string; anchor: 'start' | 'end'; fontSize: number }

export type ChartLayout = {
  width: number
  height: number
  hasWeight: boolean
  hasReps: boolean
  gridLines: { x1: number; y1: number; x2: number; y2: number }[]
  weightPolyline: string
  repsPolyline: string
  weightDots: { cx: number; cy: number }[]
  repsDots: { cx: number; cy: number }[]
  weightLabels: ValueLabel[]
  repsLabels: ValueLabel[]
  xAxisLabels: AxisLabel[]
  repsClassName: string
}

export function buildChartLayout(points: HistoryPoint[]): ChartLayout {
  const W = 300
  const H = 140
  const ML = 36
  const MR = 28
  const MT = 10
  const MB = 22
  const IW = W - ML - MR
  const IH = H - MT - MB
  const n = points.length

  const empty: ChartLayout = {
    width: W,
    height: H,
    hasWeight: false,
    hasReps: false,
    gridLines: [MT, MT + IH / 2, MT + IH].map((y) => ({ x1: ML, y1: y, x2: W - MR, y2: y })),
    weightPolyline: '',
    repsPolyline: '',
    weightDots: [],
    repsDots: [],
    weightLabels: [],
    repsLabels: [],
    xAxisLabels: [],
    repsClassName: REPS_STROKE_CLASS,
  }
  if (n === 0) return empty

  const xFor = (i: number) => (n === 1 ? ML + IW / 2 : ML + (i / (n - 1)) * IW)

  const hasWeight = points.some((p) => p.maxWeight != null)
  const hasReps = points.some((p) => p.maxReps != null)

  const wVals = points.map((p) => p.maxWeight).filter((v): v is number => v != null)
  const maxW = wVals.length ? Math.max(...wVals) : 0
  const minW = wVals.length ? Math.min(...wVals) : 0
  const rangeW = maxW - minW

  const rVals = points.map((p) => p.maxReps).filter((v): v is number => v != null)
  const maxR = rVals.length ? Math.max(...rVals) : 0
  const minR = rVals.length ? Math.min(...rVals) : 0
  const rangeR = maxR - minR

  const bothFlat = rangeW === 0 && rangeR === 0
  const yW = (v: number) => (rangeW === 0 ? MT + IH * (bothFlat ? 0.33 : 0.5) : MT + (1 - (v - minW) / rangeW) * IH)
  const yR = (v: number) => (rangeR === 0 ? MT + IH * (bothFlat ? 0.67 : 0.5) : MT + (1 - (v - minR) / rangeR) * IH)

  const weightPolyline = points
    .flatMap((p, i) => (p.maxWeight != null ? [`${xFor(i).toFixed(1)},${yW(p.maxWeight).toFixed(1)}`] : []))
    .join(' ')
  const repsPolyline = points
    .flatMap((p, i) => (p.maxReps != null ? [`${xFor(i).toFixed(1)},${yR(p.maxReps).toFixed(1)}`] : []))
    .join(' ')

  const weightDots = points.flatMap((p, i) => (p.maxWeight != null ? [{ cx: xFor(i), cy: yW(p.maxWeight) }] : []))
  const repsDots = points.flatMap((p, i) => (p.maxReps != null ? [{ cx: xFor(i), cy: yR(p.maxReps) }] : []))

  const firstWIdx = points.findIndex((p) => p.maxWeight != null)
  const lastWIdx = points.reduce((acc, p, i) => (p.maxWeight != null ? i : acc), -1)
  const firstRIdx = points.findIndex((p) => p.maxReps != null)
  const lastRIdx = points.reduce((acc, p, i) => (p.maxReps != null ? i : acc), -1)

  function nudge(primary: number | null, secondary: number): number {
    if (primary == null) return secondary
    const diff = secondary - primary
    return Math.abs(diff) < LABEL_GAP ? primary + (diff >= 0 ? LABEL_GAP : -LABEL_GAP) : secondary
  }
  const rFirstY = firstRIdx >= 0 ? nudge(firstWIdx >= 0 ? yW(points[firstWIdx].maxWeight!) : null, yR(points[firstRIdx].maxReps!)) : 0
  const rLastY = lastRIdx >= 0 ? nudge(lastWIdx >= 0 ? yW(points[lastWIdx].maxWeight!) : null, yR(points[lastRIdx].maxReps!)) : 0

  const weightLabels: ValueLabel[] = []
  if (firstWIdx >= 0) {
    weightLabels.push({
      x: xFor(firstWIdx) - 8,
      y: yW(points[firstWIdx].maxWeight!) + 4,
      value: points[firstWIdx].maxWeight!,
      fill: WEIGHT_STROKE,
      fontSize: LABEL_FONT_SIZE,
      anchor: 'end',
    })
  }
  if (lastWIdx >= 0 && lastWIdx !== firstWIdx) {
    weightLabels.push({
      x: xFor(lastWIdx) + 8,
      y: yW(points[lastWIdx].maxWeight!) + 4,
      value: points[lastWIdx].maxWeight!,
      fill: WEIGHT_STROKE,
      fontSize: LABEL_FONT_SIZE,
      anchor: 'start',
    })
  }

  const repsLabels: ValueLabel[] = []
  if (firstRIdx >= 0) {
    repsLabels.push({
      x: xFor(firstRIdx) - 8,
      y: rFirstY + 4,
      value: points[firstRIdx].maxReps!,
      fill: REPS_STROKE,
      className: REPS_STROKE_CLASS,
      fontSize: LABEL_FONT_SIZE,
      anchor: 'end',
    })
  }
  if (lastRIdx >= 0 && lastRIdx !== firstRIdx) {
    repsLabels.push({
      x: xFor(lastRIdx) + 8,
      y: rLastY + 4,
      value: points[lastRIdx].maxReps!,
      fill: REPS_STROKE,
      className: REPS_STROKE_CLASS,
      fontSize: LABEL_FONT_SIZE,
      anchor: 'start',
    })
  }

  const xAxisLabels: AxisLabel[] = [
    { x: ML, y: H - 4, text: fmtDate(points[0].date), anchor: 'start', fontSize: AXIS_FONT_SIZE },
    { x: W - MR, y: H - 4, text: fmtDate(points[points.length - 1].date), anchor: 'end', fontSize: AXIS_FONT_SIZE },
  ]

  return {
    width: W,
    height: H,
    hasWeight,
    hasReps,
    gridLines: [MT, MT + IH / 2, MT + IH].map((y) => ({ x1: ML, y1: y, x2: W - MR, y2: y })),
    weightPolyline,
    repsPolyline,
    weightDots,
    repsDots,
    weightLabels,
    repsLabels,
    xAxisLabels,
    repsClassName: REPS_STROKE_CLASS,
  }
}

// Accessible summary text — used as the SVG's <title>/<desc> content and/or
// aria-label so screen-reader users get the trend without parsing the SVG.
export function buildChartSummary(points: HistoryPoint[]): string {
  if (points.length === 0) return 'No exercise history data available.'

  const hasWeight = points.some((p) => p.maxWeight != null)
  const hasReps = points.some((p) => p.maxReps != null)

  const firstDate = fmtDate(points[0].date)
  const lastDate = fmtDate(points[points.length - 1].date)

  const firstW = points.find((p) => p.maxWeight != null)?.maxWeight ?? null
  const lastW = [...points].reverse().find((p) => p.maxWeight != null)?.maxWeight ?? null
  const firstR = points.find((p) => p.maxReps != null)?.maxReps ?? null
  const lastR = [...points].reverse().find((p) => p.maxReps != null)?.maxReps ?? null

  const parts: string[] = []
  if (points.length === 1) {
    parts.push(`Single session on ${firstDate}.`)
  } else {
    parts.push(`History chart from ${firstDate} to ${lastDate} across ${points.length} sessions.`)
  }
  if (hasWeight) {
    parts.push(
      firstW === lastW || lastW == null
        ? `Max weight ${firstW} kg.`
        : `Max weight went from ${firstW} kg to ${lastW} kg.`
    )
  }
  if (hasReps) {
    parts.push(
      firstR === lastR || lastR == null
        ? `Max reps ${firstR}.`
        : `Max reps went from ${firstR} to ${lastR}.`
    )
  }
  return parts.join(' ')
}
