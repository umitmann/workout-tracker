import {
  parseTrainerProfileForm,
  parseTrainerReviewForm,
} from '@/lib/trainerValidation'
import type { TrainerActionState } from '@/lib/trainerTypes'

type ActionUser = { id: string }
type ActionError = { message: string; code?: string | null }
type ActionResult<T = unknown> = { data: T; error: ActionError | null }

export type TrainerActionClient = {
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

function authenticationFailure(): TrainerActionState {
  return {
    success: false,
    message: 'Your session has expired. Sign in and try again.',
  }
}

export async function saveTrainerProfileCore(
  supabase: TrainerActionClient,
  formData: FormData,
): Promise<TrainerActionState> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return authenticationFailure()

  const parsed = parseTrainerProfileForm(formData)
  if (!parsed.success) {
    return {
      success: false,
      message: 'Check the highlighted fields and try again.',
      fieldErrors: parsed.fieldErrors,
    }
  }

  const input = parsed.data
  const { error } = await supabase.rpc('save_trainer_profile', {
    p_display_name: input.displayName,
    p_bio: input.bio,
    p_specialties: input.specialties,
    p_remote_available: input.remoteAvailable,
    p_location_text: input.locationText,
    p_accepting_clients: input.acceptingClients,
    p_listing_status: input.listingStatus,
    p_avatar_url: input.avatarUrl,
  })

  if (error) {
    return {
      success: false,
      message:
        error.code === '22023'
          ? 'The profile contains an invalid value. Check the form and try again.'
          : 'We could not save your trainer profile. Try again shortly.',
    }
  }

  return {
    success: true,
    message:
      input.listingStatus === 'draft'
        ? 'Draft saved. Publish it when you are ready for directory review.'
        : 'Trainer profile saved. It will be listed after administrator approval.',
  }
}

export async function reviewTrainerProfileCore(
  supabase: TrainerActionClient,
  formData: FormData,
): Promise<TrainerActionState> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return authenticationFailure()

  const parsed = parseTrainerReviewForm(formData)
  if (!parsed.success) {
    return {
      success: false,
      message: 'The review request is invalid.',
      fieldErrors: parsed.fieldErrors,
    }
  }

  // This application check improves UX and prevents accidental calls. The
  // database function independently performs the authoritative role check.
  const adminResult = await supabase.rpc('current_user_is_platform_admin')
  if (adminResult.error || adminResult.data !== true) {
    return { success: false, message: 'Platform administrator access is required.' }
  }

  const { profileId, verificationStatus } = parsed.data
  const { error } = await supabase.rpc('admin_set_trainer_verification', {
    p_profile_id: profileId,
    p_verification_status: verificationStatus,
  })

  if (error) {
    return {
      success: false,
      message:
        error.code === 'P0002'
          ? 'That trainer profile no longer exists.'
          : 'We could not save the review decision. Try again shortly.',
    }
  }

  return {
    success: true,
    message: `Trainer profile ${verificationStatus}.`,
  }
}
