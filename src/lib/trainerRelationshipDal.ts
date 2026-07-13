import 'server-only'

import { requireQueryData } from './dataAccessError'
import { getServerAuthContext } from './serverAuth'
import type {
  TrainerRelationshipAuditEvent,
  TrainerRelationshipSummary,
} from './trainerRelationshipTypes'

async function getAuthenticatedClient() {
  const context = await getServerAuthContext()
  if (!context.user) throw new Error('Authentication required')
  return context.supabase
}
export async function listMyTrainerRelationships(): Promise<TrainerRelationshipSummary[]> {
  const supabase = await getAuthenticatedClient()
  const result = await supabase.rpc('list_my_trainer_relationships')
  return (requireQueryData(result, 'load trainer connections') ?? []) as TrainerRelationshipSummary[]
}

export async function getMyRelationshipForTrainerProfile(
  trainerProfileId: string,
): Promise<TrainerRelationshipSummary | null> {
  const relationships = await listMyTrainerRelationships()
  return relationships.find(
    (relationship) =>
      relationship.my_role === 'trainee'
      && relationship.trainer_profile_id === trainerProfileId,
  ) ?? null
}

export async function getMyTrainerRelationship(
  relationshipId: string,
): Promise<TrainerRelationshipSummary | null> {
  const relationships = await listMyTrainerRelationships()
  return relationships.find(
    (relationship) => relationship.relationship_id === relationshipId,
  ) ?? null
}

export async function listTrainerRelationshipAudit(
  relationshipId: string,
): Promise<TrainerRelationshipAuditEvent[]> {
  const supabase = await getAuthenticatedClient()
  const result = await supabase.rpc('list_trainer_relationship_audit', {
    p_relationship_id: relationshipId,
  })
  return (requireQueryData(result, 'load trainer connection history') ?? []) as TrainerRelationshipAuditEvent[]
}
