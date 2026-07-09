'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getRecentBodyWeights, BodyWeightRow } from '@/lib/dal'
import { logBodyWeightCore } from './cores'

// Logs (or overwrites) the user's bodyweight for a given date. One entry per day.
export async function logBodyWeight(
  weight: number,
  date?: string,
): Promise<{ error?: string; success?: true }> {
  return logBodyWeightCore(await createServerSupabaseClient(), weight, date)
}

export async function fetchRecentBodyWeights(limit = 30): Promise<BodyWeightRow[]> {
  return getRecentBodyWeights(limit)
}
