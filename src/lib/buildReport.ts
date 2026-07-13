// Pure text-report builder for the PT export feature.
// Kept free of DB/Next imports so it can be unit-tested in isolation.

import { DEFAULT_DISTANCE_UNIT, DistanceUnit, convertKmTo, formatDistance } from './distanceUnit'

export type ReportSet = {
  weight: number | null
  reps: number | null
  duration_minutes: number | null
  distance: number | null
  rest_seconds?: number | null
}

export type ReportExercise = {
  name: string
  category: string | null
  sets: ReportSet[]
}

export type ReportWorkout = {
  date: string // YYYY-MM-DD
  exercises: ReportExercise[]
}

export type ReportBodyWeight = {
  date: string // YYYY-MM-DD
  weight: number
}

// Raw shape handed back by dal.ts's getWorkoutsInRange (RangeWorkoutRow) —
// one row per set, already ordered by date ascending and (within a workout)
// by created_at. groupWorkoutSets folds that flat list into ReportWorkout[]
// without re-sorting workouts (the DAL owns date order) or exercises
// (first-seen order is the source of truth — checklist §4.9/§4.10).
export type RawReportRow = {
  id: number
  date: string
  sets: {
    exercise_id: number
    weight: number | null
    reps: number | null
    duration_minutes: number | null
    distance: number | null
    rest_seconds: number | null
    exercises: { name: string; category: string | null } | null
  }[]
}

// exportReport's grouping/ordering core (finding L7): groups each workout's
// flat set list by exercise, in first-seen order, falling back to the raw
// exercise id when the join returned no name (deleted/unseeded exercise).
export function groupWorkoutSets(rows: RawReportRow[]): ReportWorkout[] {
  return rows.map((w) => {
    const order: number[] = []
    const byExercise = new Map<number, ReportExercise>()
    for (const s of w.sets) {
      let ex = byExercise.get(s.exercise_id)
      if (!ex) {
        ex = {
          name: s.exercises?.name ?? String(s.exercise_id),
          category: s.exercises?.category ?? null,
          sets: [],
        }
        byExercise.set(s.exercise_id, ex)
        order.push(s.exercise_id)
      }
      ex.sets.push({
        weight: s.weight,
        reps: s.reps,
        duration_minutes: s.duration_minutes,
        distance: s.distance,
        rest_seconds: s.rest_seconds,
      })
    }
    return { date: w.date, exercises: order.map((id) => byExercise.get(id)!) }
  })
}

export type ReportInput = {
  rangeLabel: string
  from: string // YYYY-MM-DD
  to: string // YYYY-MM-DD
  athlete?: string | null
  workouts: ReportWorkout[]
  bodyWeights?: ReportBodyWeight[]
  // WP-12 (checklist §19.10/§19.11): distance display unit. The DB always
  // stores km (ADR-0003) — this only changes how it's rendered. Defaults to
  // km so existing callers/snapshots are unaffected.
  unit?: DistanceUnit
}

const RULE = '='.repeat(44)
const SUBRULE = '-'.repeat(44)

function fmtNumber(n: number): string {
  // Trim trailing .0 but keep meaningful decimals, add thousands separators.
  const rounded = Math.round(n * 100) / 100
  const [intPart, decPart] = String(rounded).split('.')
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decPart ? `${withSep}.${decPart}` : withSep
}

function fmtDateLong(iso: string): string {
  // Parse as local date without timezone drift.
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Augment ReportSet at render time with the parent category flag.
type RenderSet = ReportSet & { category_is_cardio?: boolean }

function restSuffix(s: RenderSet): string {
  return s.rest_seconds != null ? ` (rest ${fmtNumber(s.rest_seconds)}s)` : ''
}

function fmtSet(s: RenderSet, index: number, unit: DistanceUnit): string {
  const n = `  ${index}.`
  const rest = restSuffix(s)
  if (s.category_is_cardio || s.duration_minutes != null || s.distance != null) {
    const parts: string[] = []
    if (s.duration_minutes != null) parts.push(`${fmtNumber(s.duration_minutes)} min`)
    const distanceLabel = formatDistance(convertKmTo(s.distance, unit), unit)
    if (distanceLabel != null) parts.push(distanceLabel)
    return `${n} ${parts.length ? parts.join(' · ') : '—'}${rest}`
  }
  if (s.weight != null && s.reps != null) return `${n} ${fmtNumber(s.weight)} kg × ${s.reps}${rest}`
  if (s.weight != null) return `${n} ${fmtNumber(s.weight)} kg${rest}`
  if (s.reps != null) return `${n} ${s.reps} reps${rest}`
  return `${n} —${rest}`
}

export function buildReport(input: ReportInput): string {
  const unit: DistanceUnit = input.unit === 'm' ? 'm' : DEFAULT_DISTANCE_UNIT
  const lines: string[] = []
  const workouts = [...input.workouts].sort((a, b) => a.date.localeCompare(b.date))
  const bodyWeights = [...(input.bodyWeights ?? [])].sort((a, b) => a.date.localeCompare(b.date))

  lines.push('WORKOUT REPORT')
  lines.push(`${input.rangeLabel} · ${input.from} to ${input.to}`)
  if (input.athlete) lines.push(`Athlete: ${input.athlete}`)
  lines.push('')

  if (workouts.length === 0) {
    lines.push('No workouts logged in this period.')
    if (bodyWeights.length > 0) {
      lines.push('')
      lines.push(...bodyweightSummary(bodyWeights))
    }
    return lines.join('\n')
  }

  let totalSets = 0
  let totalVolume = 0

  for (const w of workouts) {
    lines.push(RULE)
    lines.push(fmtDateLong(w.date))
    lines.push(SUBRULE)
    if (w.exercises.length === 0) {
      lines.push('(no exercises logged)')
    }
    for (const ex of w.exercises) {
      const isCardio = ex.category === 'cardio'
      const title = isCardio ? `${ex.name} (cardio)` : ex.name
      lines.push(title)
      ex.sets.forEach((s, i) => {
        totalSets++
        if (!isCardio && s.weight != null && s.reps != null) totalVolume += s.weight * s.reps
        const rs: RenderSet = { ...s, category_is_cardio: isCardio }
        lines.push(fmtSet(rs, i + 1, unit))
      })
    }
    lines.push('')
  }

  lines.push(RULE)
  lines.push('SUMMARY')
  lines.push(SUBRULE)
  lines.push(`Workouts: ${workouts.length}`)
  lines.push(`Total sets: ${totalSets}`)
  lines.push(`Total volume: ${fmtNumber(totalVolume)} kg`)
  if (bodyWeights.length > 0) lines.push(...bodyweightSummary(bodyWeights))

  return lines.join('\n')
}

function bodyweightSummary(bw: ReportBodyWeight[]): string[] {
  const first = bw[0]
  const last = bw[bw.length - 1]
  if (first.date === last.date) {
    return [`Bodyweight: ${fmtNumber(first.weight)} kg`]
  }
  const delta = last.weight - first.weight
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±'
  return [
    `Bodyweight: ${fmtNumber(first.weight)} kg → ${fmtNumber(last.weight)} kg (${sign}${fmtNumber(Math.abs(delta))} kg)`,
  ]
}
