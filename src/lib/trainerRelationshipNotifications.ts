import type { TrainerRelationshipSummary } from './trainerRelationshipTypes'

type NotificationRelationship = Pick<
  TrainerRelationshipSummary,
  'my_role' | 'status' | 'awaiting_my_response'
>

export type TrainerRelationshipNotificationCounts = {
  trainee: number
  trainer: number
}

export function countTrainerRelationshipNotifications(
  relationships: readonly NotificationRelationship[],
): TrainerRelationshipNotificationCounts {
  const counts: TrainerRelationshipNotificationCounts = {
    trainee: 0,
    trainer: 0,
  }

  for (const relationship of relationships) {
    if (
      relationship.status === 'pending'
      && relationship.awaiting_my_response
    ) {
      counts[relationship.my_role] += 1
    }
  }

  return counts
}

export function trainerNotificationLabel(label: string, count: number): string {
  return Number.isInteger(count) && count > 0 ? `${label} (${count})` : label
}
