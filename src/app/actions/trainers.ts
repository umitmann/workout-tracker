'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { TrainerActionState } from '@/lib/trainerTypes'
import {
  reviewTrainerProfileCore,
  saveTrainerProfileCore,
  type TrainerActionClient,
} from './trainerCores'

export async function saveTrainerProfileAction(
  _previousState: TrainerActionState | null,
  formData: FormData,
): Promise<TrainerActionState> {
  const client = (await createServerSupabaseClient()) as unknown as TrainerActionClient
  const result = await saveTrainerProfileCore(client, formData)
  if (result.success) {
    revalidatePath('/trainers')
    revalidatePath('/trainers/apply')
    revalidatePath('/admin/trainers')
  }
  return result
}

export async function reviewTrainerProfileAction(
  _previousState: TrainerActionState | null,
  formData: FormData,
): Promise<TrainerActionState> {
  const client = (await createServerSupabaseClient()) as unknown as TrainerActionClient
  const result = await reviewTrainerProfileCore(client, formData)
  if (result.success) {
    revalidatePath('/trainers')
    revalidatePath('/admin/trainers')
  }
  return result
}
