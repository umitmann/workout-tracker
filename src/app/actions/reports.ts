'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getWorkoutsInRange, getBodyWeightsInRange } from '@/lib/dal'
import { buildReport, groupWorkoutSets } from '@/lib/buildReport'
import { dateNDaysBefore } from '@/lib/localDate'

export type ReportRange = 'week' | 'month'

export async function exportReport(
  range: ReportRange,
  to: string,
): Promise<{ filename: string; text: string } | { error: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const from = range === 'week' ? dateNDaysBefore(to, 6) : dateNDaysBefore(to, 29)
  const rangeLabel = range === 'week' ? 'Last 7 days' : 'Last 30 days'

  const [rows, bodyWeights] = await Promise.all([
    getWorkoutsInRange(from, to),
    getBodyWeightsInRange(from, to),
  ])

  const workouts = groupWorkoutSets(rows)

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
