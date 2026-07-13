'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getRecentBodyWeights, BodyWeightRow } from '@/lib/dal'
import { logBodyWeightCore } from './cores'

// Logs (or overwrites) the user's bodyweight for a given date. One entry per
// day. ADR-0005: the caller (client) always supplies its own local day —
// this never defaults to a server-computed "today", which would be the
// server's UTC clock, not the user's.
export async function logBodyWeight(
  weight: number,
  date: string,
): Promise<{ error?: string; success?: true }> {
  return logBodyWeightCore(await createServerSupabaseClient(), weight, date)
}

export async function fetchRecentBodyWeights(limit = 30): Promise<BodyWeightRow[]> {
  return getRecentBodyWeights(limit)
}
