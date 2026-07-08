'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getWorkoutsInRange, getBodyWeightsInRange } from '@/lib/dal'
import { buildReport, ReportWorkout, ReportExercise } from '@/lib/buildReport'

export type ReportRange = 'week' | 'month'

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

export async function exportReport(
  range: ReportRange,
): Promise<{ filename: string; text: string } | { error: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const to = new Date().toISOString().split('T')[0]
  const from = range === 'week' ? isoDaysAgo(6) : isoDaysAgo(29)
  const rangeLabel = range === 'week' ? 'Last 7 days' : 'Last 30 days'

  const [rows, bodyWeights] = await Promise.all([
    getWorkoutsInRange(from, to),
    getBodyWeightsInRange(from, to),
  ])

  const workouts: ReportWorkout[] = rows.map((w) => {
    // Group sets by exercise, preserving first-seen order.
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

  const text = buildReport({
    rangeLabel,
    from,
    to,
    athlete: user.email ?? null,
    workouts,
    bodyWeights,
  })

  return { filename: `workout-report-${range}-${to}.txt`, text }
}
