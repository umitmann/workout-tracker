'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { TrainerExerciseActionState } from '@/lib/trainerExerciseTypes'
import {
  archiveTrainerExerciseCore,
  saveTrainerExerciseCore,
  type TrainerExerciseActionClient,
} from './trainerExerciseCores'

function revalidateExerciseViews() {
  revalidatePath('/routines')
  revalidatePath('/trainer/exercises')
  revalidatePath('/workout')
  revalidatePath('/workouts')
}

export async function saveTrainerExerciseAction(
  _previousState: TrainerExerciseActionState | null,
  formData: FormData,
): Promise<TrainerExerciseActionState> {
  const client = (await createServerSupabaseClient()) as unknown as TrainerExerciseActionClient
  const result = await saveTrainerExerciseCore(client, formData)
  if (result.success) revalidateExerciseViews()
  return result
}

export async function archiveTrainerExerciseAction(
  _previousState: TrainerExerciseActionState | null,
  formData: FormData,
): Promise<TrainerExerciseActionState> {
  const client = (await createServerSupabaseClient()) as unknown as TrainerExerciseActionClient
  const result = await archiveTrainerExerciseCore(client, formData)
  if (result.success) revalidateExerciseViews()
  return result
}
