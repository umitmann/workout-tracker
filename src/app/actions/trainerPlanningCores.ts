import {
  parseTrainerPlanAssignment,
  parseWorkoutPlanTransition,
} from '@/lib/trainerPlanningValidation'
import { isUuid } from '@/lib/trainerValidation'
import type { TrainerPlanningActionState } from '@/lib/trainerPlanningTypes'

type PlanningActionError = { message: string; code?: string | null }
type PlanningActionResult<T = unknown> = { data: T; error: PlanningActionError | null }

export type TrainerPlanningActionClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string } | null }
      error?: PlanningActionError | null
    }>
  }
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<PlanningActionResult>
}

function authenticationFailure(): TrainerPlanningActionState {
  return {
    success: false,
    message: 'Your session has expired. Sign in and try again.',
  }
}

function invalidRequest(message: string): TrainerPlanningActionState {
  return { success: false, message }
}

function mutationFailure(
  error: PlanningActionError,
  fallback: string,
): TrainerPlanningActionState {
  if (error.code === '42501') {
    return {
      success: false,
      message: 'This action is not allowed for the current training connection.',
    }
  }
  if (error.code === 'P0002') {
    return { success: false, message: 'That workout plan is no longer available.' }
  }
  if (error.code === '22023' || error.code === '23514') {
    return { success: false, message: 'Check the workout details and try again.' }
  }
  if (error.code === '23505') {
    return { success: false, message: 'This workout plan has already been started.' }
  }
  return { success: false, message: fallback }
}

async function isAuthenticated(client: TrainerPlanningActionClient): Promise<boolean> {
  const {
    data: { user },
    error,
  } = await client.auth.getUser()
  return Boolean(user && !error)
}

export async function assignTrainerWorkoutCore(
  client: TrainerPlanningActionClient,
  formData: FormData,
): Promise<TrainerPlanningActionState> {
  if (!(await isAuthenticated(client))) return authenticationFailure()

  const parsed = parseTrainerPlanAssignment(formData)
  if (!parsed.success) {
    return invalidRequest('Choose a valid template, date, and prescription details.')
  }

  const { data, error } = await client.rpc('assign_workout_from_routine', {
    p_relationship_id: parsed.data.relationshipId,
    p_routine_id: parsed.data.routineId,
    p_scheduled_date: parsed.data.scheduledDate,
    p_title: parsed.data.title,
    p_instructions: parsed.data.instructions,
  })

  if (error) {
    return mutationFailure(error, 'We could not assign the workout. Try again shortly.')
  }
  if (typeof data !== 'string' || !isUuid(data)) {
    return invalidRequest('The workout could not be confirmed. Refresh and try again.')
  }

  return {
    success: true,
    message: 'Workout assigned. The prescription is now a fixed snapshot.',
    planId: data.toLowerCase(),
  }
}

export async function startWorkoutPlanCore(
  client: TrainerPlanningActionClient,
  formData: FormData,
): Promise<TrainerPlanningActionState> {
  if (!(await isAuthenticated(client))) return authenticationFailure()

  const parsed = parseWorkoutPlanTransition(formData)
  if (!parsed.success) return invalidRequest('Choose a valid workout plan.')

  const { data, error } = await client.rpc('start_workout_plan', {
    p_plan_id: parsed.data.planId,
  })
  if (error) {
    return mutationFailure(error, 'We could not start the workout. Refresh and try again.')
  }

  const workoutId = typeof data === 'number' ? data : Number(data)
  if (!Number.isSafeInteger(workoutId) || workoutId <= 0) {
    return invalidRequest('The workout could not be opened. Refresh and try again.')
  }

  return { success: true, message: 'Workout started.', workoutId }
}

export async function cancelWorkoutPlanCore(
  client: TrainerPlanningActionClient,
  formData: FormData,
): Promise<TrainerPlanningActionState> {
  if (!(await isAuthenticated(client))) return authenticationFailure()

  const parsed = parseWorkoutPlanTransition(formData)
  if (!parsed.success) return invalidRequest('Choose a valid workout plan.')

  const { error } = await client.rpc('cancel_workout_plan', {
    p_plan_id: parsed.data.planId,
  })
  if (error) {
    return mutationFailure(error, 'We could not cancel the workout. Refresh and try again.')
  }

  return { success: true, message: 'Workout cancelled.' }
}
