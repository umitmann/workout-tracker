export const TRAINER_RELATIONSHIP_STATUSES = [
  'pending',
  'active',
  'declined',
  'ended',
  'expired',
] as const

export const TRAINER_PERMISSIONS = [
  'workout_results.read',
  'bodyweight.read',
] as const

export const TRAINER_ACCESS_HISTORY_SCOPES = ['all', 'from_now'] as const

export type TrainerRelationshipStatus = (typeof TRAINER_RELATIONSHIP_STATUSES)[number]
export type TrainerPermission = (typeof TRAINER_PERMISSIONS)[number]
export type TrainerAccessHistoryScope = (typeof TRAINER_ACCESS_HISTORY_SCOPES)[number]
export type TrainerRelationshipRole = 'trainer' | 'trainee'

/**
 * Minimal participant DTO returned by list_my_trainer_relationships.
 * It intentionally excludes auth user IDs, email addresses, and health data.
 */
export type TrainerRelationshipSummary = {
  relationship_id: string
  trainer_profile_id: string
  counterparty_display_name: string
  counterparty_avatar_url: string | null
  my_role: TrainerRelationshipRole
  status: TrainerRelationshipStatus
  initiated_by_me: boolean
  awaiting_my_response: boolean
  created_at: string
  activated_at: string | null
  ended_at: string | null
  workout_results_access: boolean
  workout_results_date_from: string | null
  bodyweight_access: boolean
  bodyweight_date_from: string | null
}
export type TrainerRelationshipAuditEvent = {
  event_type:
    | 'relationship.requested'
    | 'relationship.accepted'
    | 'relationship.activated'
    | 'relationship.declined'
    | 'relationship.ended'
    | 'access.granted'
    | 'access.revoked'
  actor_role: TrainerRelationshipRole | 'system'
  details: Record<string, unknown>
  occurred_at: string
}

export type TrainerRelationshipActionState = {
  success: boolean
  message: string
}
