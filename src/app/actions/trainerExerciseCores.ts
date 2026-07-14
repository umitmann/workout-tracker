import { parseTrainerExerciseForm } from '@/lib/trainerExerciseValidation'
import type { TrainerExerciseActionState } from '@/lib/trainerExerciseTypes'

type ActionUser = { id: string }
type ActionError = { message?: string; code?: string | null }
type ActionResult = { data: unknown; error: ActionError | null }

export type TrainerExerciseActionClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: ActionUser | null }
      error?: ActionError | null
    }>
  }
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<ActionResult>
}

function signedOut(): TrainerExerciseActionState {
  return {
    success: false,
    message: 'Your session has expired. Sign in and try again.',
  }
}

function saveFailure(code?: string | null): TrainerExerciseActionState {
  if (code === '42501') {
    return { success: false, message: 'An approved personal trainer profile is required.' }
  }
  if (code === '23505') {
    return { success: false, message: 'You already have an exercise with that name.' }
  }
  if (code === 'P0002') {
    return { success: false, message: 'That exercise no longer exists.' }
  }
  if (code === '22023' || code === '23514') {
    return { success: false, message: 'The exercise contains an invalid value. Check the form.' }
  }
  return { success: false, message: 'We could not save the exercise. Try again shortly.' }
}

export async function saveTrainerExerciseCore(
  supabase: TrainerExerciseActionClient,
  formData: FormData,
): Promise<TrainerExerciseActionState> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return signedOut()

  const parsed = parseTrainerExerciseForm(formData)
  if (!parsed.success) {
    return {
      success: false,
      message: 'Check the highlighted fields and try again.',
      fieldErrors: parsed.fieldErrors,
    }
  }

  const input = parsed.data
  const { data, error } = await supabase.rpc('save_trainer_exercise', {
    p_exercise_id: input.exerciseId,
    p_name: input.name,
    p_category: input.category,
    p_equipment: input.equipment,
    p_muscles: input.primaryMuscles,
    p_muscles_secondary: input.secondaryMuscles,
    p_instructions: input.instructions,
    p_video_url: input.videoUrl,
    p_visibility: input.visibility,
  })
  if (error) return saveFailure(error.code)

  const exerciseId = Number(data)
  return {
    success: true,
    message: input.exerciseId
      ? 'Exercise updated.'
      : input.visibility === 'clients'
        ? 'Exercise created for your clients.'
        : 'Exercise created for everyone.',
    exerciseId: Number.isSafeInteger(exerciseId) ? exerciseId : input.exerciseId ?? undefined,
  }
}

export async function archiveTrainerExerciseCore(
  supabase: TrainerExerciseActionClient,
  formData: FormData,
): Promise<TrainerExerciseActionState> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return signedOut()

  const exerciseId = Number(formData.get('exerciseId'))
  if (!Number.isSafeInteger(exerciseId) || exerciseId <= 0) {
    return { success: false, message: 'Choose a valid exercise.' }
  }

  const { error } = await supabase.rpc('archive_trainer_exercise', {
    p_exercise_id: exerciseId,
  })
  if (error) return saveFailure(error.code)
  return { success: true, message: 'Exercise archived. Existing workout history is unchanged.' }
}
