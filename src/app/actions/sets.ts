'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { addSetCore, deleteSetCore, SetData } from './cores'

export async function addSet(workoutId: number, exerciseId: number, data: SetData) {
  return addSetCore(await createServerSupabaseClient(), workoutId, exerciseId, data)
}

export async function deleteSet(setId: number) {
  return deleteSetCore(await createServerSupabaseClient(), setId)
}
