'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { TrainerRelationshipActionState } from '@/lib/trainerRelationshipTypes'
import { isUuid } from '@/lib/trainerValidation'
import {
  acceptTrainerRelationshipCore,
  declineTrainerRelationshipCore,
  endTrainerRelationshipCore,
  grantTrainerAccessCore,
  requestTrainerRelationshipCore,
  revokeTrainerAccessCore,
  type TrainerRelationshipActionClient,
} from './trainerRelationshipCores'

async function relationshipClient(): Promise<TrainerRelationshipActionClient> {
  return (await createServerSupabaseClient()) as unknown as TrainerRelationshipActionClient
}
function revalidateRelationshipViews(
  formData?: FormData,
  { participantPages = true }: { participantPages?: boolean } = {},
) {
  revalidatePath('/dashboard')
  revalidatePath('/trainers')
  if (participantPages) {
    revalidatePath('/connections')
    revalidatePath('/trainer/connections')
  }
  revalidatePath('/trainer/clients')

  const rawRelationshipId = formData?.get('relationshipId')
  if (typeof rawRelationshipId === 'string') {
    const relationshipId = rawRelationshipId.trim().toLowerCase()
    if (isUuid(relationshipId)) {
      revalidatePath(`/trainer/clients/${relationshipId}`)
    }
  }
}

export async function requestTrainerRelationshipAction(
  _previousState: TrainerRelationshipActionState | null,
  formData: FormData,
): Promise<TrainerRelationshipActionState> {
  const result = await requestTrainerRelationshipCore(await relationshipClient(), formData)
  if (result.success) {
    revalidateRelationshipViews()
    const profileId = formData.get('trainerProfileId')
    if (typeof profileId === 'string') revalidatePath(`/trainers/${profileId.trim().toLowerCase()}`)
  }
  return result
}

export async function acceptTrainerRelationshipAction(
  _previousState: TrainerRelationshipActionState | null,
  formData: FormData,
): Promise<TrainerRelationshipActionState> {
  const result = await acceptTrainerRelationshipCore(await relationshipClient(), formData)
  if (result.success) revalidateRelationshipViews(formData)
  return result
}

export async function declineTrainerRelationshipAction(
  _previousState: TrainerRelationshipActionState | null,
  formData: FormData,
): Promise<TrainerRelationshipActionState> {
  const result = await declineTrainerRelationshipCore(await relationshipClient(), formData)
  if (result.success) revalidateRelationshipViews(formData, { participantPages: false })
  return result
}

export async function endTrainerRelationshipAction(
  _previousState: TrainerRelationshipActionState | null,
  formData: FormData,
): Promise<TrainerRelationshipActionState> {
  const result = await endTrainerRelationshipCore(await relationshipClient(), formData)
  if (result.success) revalidateRelationshipViews(formData, { participantPages: false })
  return result
}

export async function grantTrainerAccessAction(
  _previousState: TrainerRelationshipActionState | null,
  formData: FormData,
): Promise<TrainerRelationshipActionState> {
  const result = await grantTrainerAccessCore(await relationshipClient(), formData)
  if (result.success) revalidateRelationshipViews(formData)
  return result
}

export async function revokeTrainerAccessAction(
  _previousState: TrainerRelationshipActionState | null,
  formData: FormData,
): Promise<TrainerRelationshipActionState> {
  const result = await revokeTrainerAccessCore(await relationshipClient(), formData)
  if (result.success) revalidateRelationshipViews(formData)
  return result
}
