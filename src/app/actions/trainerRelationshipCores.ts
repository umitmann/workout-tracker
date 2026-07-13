import {
  parseTrainerAccessGrant,
  parseTrainerAccessRevocation,
  parseTrainerRelationshipRequest,
  parseTrainerRelationshipTransition,
} from '@/lib/trainerRelationshipValidation'
import type { TrainerRelationshipActionState } from '@/lib/trainerRelationshipTypes'

type ActionUser = { id: string }
type ActionError = { message: string; code?: string | null }
type ActionResult<T = unknown> = { data: T; error: ActionError | null }

export type TrainerRelationshipActionClient = {
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
function authenticationFailure(): TrainerRelationshipActionState {
  return {
    success: false,
    message: 'Your session has expired. Sign in and try again.',
  }
}

function invalidRequest(message = 'The connection request is invalid.'): TrainerRelationshipActionState {
  return { success: false, message }
}

function mutationFailure(
  error: ActionError,
  fallback: string,
): TrainerRelationshipActionState {
  if (error.code === '42501') {
    return { success: false, message: 'This action is not allowed for the current connection.' }
  }
  if (error.code === 'P0002') {
    return { success: false, message: 'That trainer or connection is no longer available.' }
  }
  if (error.code === '22023') {
    return { success: false, message: 'The submitted connection details are invalid.' }
  }
  return { success: false, message: fallback }
}

async function isAuthenticated(
  supabase: TrainerRelationshipActionClient,
): Promise<boolean> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  return Boolean(user && !error)
}

export async function requestTrainerRelationshipCore(
  supabase: TrainerRelationshipActionClient,
  formData: FormData,
): Promise<TrainerRelationshipActionState> {
  if (!(await isAuthenticated(supabase))) return authenticationFailure()
  const parsed = parseTrainerRelationshipRequest(formData)
  if (!parsed.success) return invalidRequest('Choose a valid trainer and try again.')

  const { error } = await supabase.rpc('request_trainer_relationship', {
    p_trainer_profile_id: parsed.data.trainerProfileId,
  })
  if (error?.code === '23505') {
    return {
      success: false,
      message: 'A request is already pending, or you are already connected to this trainer.',
    }
  }
  if (error) return mutationFailure(error, 'We could not send the training request. Try again shortly.')

  return {
    success: true,
    message: 'Request pending. The trainer must accept before the connection becomes active.',
  }
}

type Transition = 'accept' | 'decline' | 'end'

const transitionConfig: Record<Transition, {
  rpc: string
  success: string
  failure: string
}> = {
  accept: {
    rpc: 'accept_trainer_relationship',
    success: 'Connection active. No results are shared unless the trainee grants access.',
    failure: 'We could not accept the training request. Try again shortly.',
  },
  decline: {
    rpc: 'decline_trainer_relationship',
    success: 'Training request declined.',
    failure: 'We could not decline the training request. Try again shortly.',
  },
  end: {
    rpc: 'end_trainer_relationship',
    success: 'Connection ended. Any active sharing permissions were revoked.',
    failure: 'We could not end the connection. Try again shortly.',
  },
}

async function transitionRelationshipCore(
  supabase: TrainerRelationshipActionClient,
  formData: FormData,
  transition: Transition,
): Promise<TrainerRelationshipActionState> {
  if (!(await isAuthenticated(supabase))) return authenticationFailure()
  const parsed = parseTrainerRelationshipTransition(formData)
  if (!parsed.success) return invalidRequest('Choose a valid connection and try again.')

  const config = transitionConfig[transition]
  const { error } = await supabase.rpc(config.rpc, {
    p_relationship_id: parsed.data.relationshipId,
  })
  if (error) return mutationFailure(error, config.failure)
  return { success: true, message: config.success }
}

export async function acceptTrainerRelationshipCore(
  supabase: TrainerRelationshipActionClient,
  formData: FormData,
): Promise<TrainerRelationshipActionState> {
  return transitionRelationshipCore(supabase, formData, 'accept')
}

export async function declineTrainerRelationshipCore(
  supabase: TrainerRelationshipActionClient,
  formData: FormData,
): Promise<TrainerRelationshipActionState> {
  return transitionRelationshipCore(supabase, formData, 'decline')
}

export async function endTrainerRelationshipCore(
  supabase: TrainerRelationshipActionClient,
  formData: FormData,
): Promise<TrainerRelationshipActionState> {
  return transitionRelationshipCore(supabase, formData, 'end')
}

export async function grantTrainerAccessCore(
  supabase: TrainerRelationshipActionClient,
  formData: FormData,
): Promise<TrainerRelationshipActionState> {
  if (!(await isAuthenticated(supabase))) return authenticationFailure()
  const parsed = parseTrainerAccessGrant(formData)
  if (!parsed.success) return invalidRequest('Choose a valid sharing category and history scope.')

  const { error } = await supabase.rpc('grant_trainer_access', {
    p_relationship_id: parsed.data.relationshipId,
    p_permission: parsed.data.permission,
    p_history_scope: parsed.data.historyScope,
  })
  if (error) return mutationFailure(error, 'We could not update the sharing permission. Try again shortly.')

  return {
    success: true,
    message: 'Sharing permission granted. You can revoke it at any time.',
  }
}

export async function revokeTrainerAccessCore(
  supabase: TrainerRelationshipActionClient,
  formData: FormData,
): Promise<TrainerRelationshipActionState> {
  if (!(await isAuthenticated(supabase))) return authenticationFailure()
  const parsed = parseTrainerAccessRevocation(formData)
  if (!parsed.success) return invalidRequest('Choose a valid sharing category.')

  const { error } = await supabase.rpc('revoke_trainer_access', {
    p_relationship_id: parsed.data.relationshipId,
    p_permission: parsed.data.permission,
  })
  if (error) return mutationFailure(error, 'We could not revoke the sharing permission. Try again shortly.')

  return {
    success: true,
    message: 'Sharing permission revoked. New trainer reads are blocked immediately.',
  }
}
