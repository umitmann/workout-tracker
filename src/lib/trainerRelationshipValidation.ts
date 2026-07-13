import { isUuid } from './trainerValidation'
import {
  TRAINER_ACCESS_HISTORY_SCOPES,
  TRAINER_PERMISSIONS,
  type TrainerAccessHistoryScope,
  type TrainerPermission,
} from './trainerRelationshipTypes'

type ValidationSuccess<T> = { success: true; data: T }
type ValidationFailure = { success: false }
export type RelationshipValidationResult<T> = ValidationSuccess<T> | ValidationFailure

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}
export function parseTrainerRelationshipRequest(
  formData: FormData,
): RelationshipValidationResult<{ trainerProfileId: string }> {
  const trainerProfileId = textValue(formData, 'trainerProfileId')
  return isUuid(trainerProfileId)
    ? { success: true, data: { trainerProfileId } }
    : { success: false }
}

export function parseTrainerRelationshipTransition(
  formData: FormData,
): RelationshipValidationResult<{ relationshipId: string }> {
  const relationshipId = textValue(formData, 'relationshipId')
  return isUuid(relationshipId)
    ? { success: true, data: { relationshipId } }
    : { success: false }
}

export function parseTrainerAccessGrant(
  formData: FormData,
): RelationshipValidationResult<{
  relationshipId: string
  permission: TrainerPermission
  historyScope: TrainerAccessHistoryScope
}> {
  const relationshipId = textValue(formData, 'relationshipId')
  const permission = textValue(formData, 'permission')
  const historyScope = textValue(formData, 'historyScope')

  if (
    !isUuid(relationshipId)
    || !TRAINER_PERMISSIONS.includes(permission as TrainerPermission)
    || !TRAINER_ACCESS_HISTORY_SCOPES.includes(historyScope as TrainerAccessHistoryScope)
  ) {
    return { success: false }
  }

  return {
    success: true,
    data: {
      relationshipId,
      permission: permission as TrainerPermission,
      historyScope: historyScope as TrainerAccessHistoryScope,
    },
  }
}

export function parseTrainerAccessRevocation(
  formData: FormData,
): RelationshipValidationResult<{
  relationshipId: string
  permission: TrainerPermission
}> {
  const relationshipId = textValue(formData, 'relationshipId')
  const permission = textValue(formData, 'permission')

  if (
    !isUuid(relationshipId)
    || !TRAINER_PERMISSIONS.includes(permission as TrainerPermission)
  ) {
    return { success: false }
  }

  return {
    success: true,
    data: { relationshipId, permission: permission as TrainerPermission },
  }
}
