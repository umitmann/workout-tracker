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
<<<<<<< HEAD
  return logBodyWeightCore(await createServerSupabaseClient(), weight, date)
=======
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  if (!Number.isFinite(weight) || weight <= 0) return { error: 'Enter a valid weight' }

  const { error } = await supabase
    .from('body_weights')
    .upsert({ user_id: user.id, date, weight }, { onConflict: 'user_id,date' })

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
>>>>>>> wp-06-v2
}

export async function fetchRecentBodyWeights(limit = 30): Promise<BodyWeightRow[]> {
  return getRecentBodyWeights(limit)
}
