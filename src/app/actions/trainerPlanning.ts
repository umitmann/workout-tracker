'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { TrainerPlanningActionState } from '@/lib/trainerPlanningTypes'
import {
  assignTrainerWorkoutCore,
  cancelWorkoutPlanCore,
  startWorkoutPlanCore,
  type TrainerPlanningActionClient,
} from './trainerPlanningCores'

async function planningClient(): Promise<TrainerPlanningActionClient> {
  return (await createServerSupabaseClient()) as unknown as TrainerPlanningActionClient
}

function revalidatePlanningViews() {
  revalidatePath('/dashboard')
  revalidatePath('/trainer/clients')
  revalidatePath('/workouts')
}

export async function assignTrainerWorkoutAction(
  _previousState: TrainerPlanningActionState | null,
  formData: FormData,
): Promise<TrainerPlanningActionState> {
  const result = await assignTrainerWorkoutCore(await planningClient(), formData)
  if (result.success) revalidatePlanningViews()
  return result
}

export async function startWorkoutPlanAction(
  _previousState: TrainerPlanningActionState | null,
  formData: FormData,
): Promise<TrainerPlanningActionState> {
  const result = await startWorkoutPlanCore(await planningClient(), formData)
  if (result.success && result.workoutId) {
    redirect(`/workout/${result.workoutId}`)
  }
  return result
}

export async function cancelWorkoutPlanAction(
  _previousState: TrainerPlanningActionState | null,
  formData: FormData,
): Promise<TrainerPlanningActionState> {
  const result = await cancelWorkoutPlanCore(await planningClient(), formData)
  if (result.success) revalidatePlanningViews()
  return result
}
