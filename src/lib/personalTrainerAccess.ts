/**
 * Pure personal-trainer domain rules.
 *
 * These helpers make the relationship, consent, and plan-lifecycle contracts
 * executable and easy to unit test. They are not an authorization boundary:
 * Server Actions and database functions must re-check the same facts against
 * current persisted state on every request.
 */

export type TrainerVerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
export type TrainerListingStatus = 'draft' | 'published' | 'paused'
export type RelationshipStatus = 'pending' | 'active' | 'declined' | 'ended' | 'expired'
export type TrainerPermission = 'workout_results.read' | 'bodyweight.read'
export type WorkoutStatus = 'planned' | 'in_progress' | 'completed'
export type WorkoutPlanStatus = 'scheduled' | 'cancelled' | 'started' | 'completed'

export type TrainerProfileState = {
  userId: string
  verificationStatus: TrainerVerificationStatus
  listingStatus: TrainerListingStatus
  acceptingClients: boolean
}

export type TrainerRelationship = {
  id: string
  trainerId: string
  traineeId: string
  initiatedBy: string
  status: RelationshipStatus
  trainerAcceptedAt: string | null
  traineeAcceptedAt: string | null
  activatedAt: string | null
  endedAt: string | null
  endedBy: string | null
  createdAt: string
}

export type TrainerAccessGrant = {
  relationshipId: string
  permission: TrainerPermission
  grantedBy: string
  grantedAt: string
  workoutDateFrom: string | null
  workoutDateTo: string | null
  revokedAt: string | null
  revokedBy: string | null
}

export type WorkoutResultResource = {
  traineeId: string
  date: string
  status: WorkoutStatus
}

export type BodyweightResource = {
  traineeId: string
  date: string
}

export type WorkoutPlanResource = {
  traineeId: string
  assignedBy: string
  relationshipId: string | null
  status: WorkoutPlanStatus
}

export type RelationshipErrorCode =
  | 'same_account'
  | 'actor_not_party'
  | 'initiator_cannot_decline'
  | 'invalid_status'
  | 'already_accepted'
  | 'invalid_timestamp'
  | 'timestamp_before_created'

export type PlanSnapshotErrorCode =
  | 'invalid_date'
  | 'invalid_title'
  | 'no_exercises'
  | 'too_many_exercises'
  | 'duplicate_order'
  | 'invalid_exercise'

export type DomainResult<T, E extends string> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export type RoutineSetDetail = {
  reps: number | null
  weight: number | null
}

export type RoutinePrescriptionExercise = {
  exerciseId: number
  sets: number
  reps: number | null
  weight: number | null
  durationMinutes: number | null
  distance: number | null
  setDetails: readonly RoutineSetDetail[] | null
  tempo: string | null
  restSeconds: number | null
  order: number
}

export type RoutinePrescription = {
  id: string | number
  ownerId: string
  name: string
  exercises: readonly RoutinePrescriptionExercise[]
}

export type WorkoutPlanSnapshot = {
  id: string
  traineeId: string
  assignedBy: string
  relationshipId: string | null
  sourceRoutineId: string | number
  scheduledDate: string
  title: string
  status: 'scheduled'
  exercises: RoutinePrescriptionExercise[]
}

export const MAX_PLAN_EXERCISES = 100
export const MAX_PLAN_TITLE_LENGTH = 120
export const MAX_PRESCRIBED_SETS = 50
export const MAX_TEMPO_LENGTH = 32

function validTimestamp(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))
}

function timestampAtOrAfter(value: string, floor: string): boolean {
  return validTimestamp(value) && validTimestamp(floor) && Date.parse(value) >= Date.parse(floor)
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

export function isTrainerApproved(profile: TrainerProfileState | null | undefined): boolean {
  return profile?.verificationStatus === 'approved'
}

export function isTrainerDiscoverable(profile: TrainerProfileState): boolean {
  return (
    profile.verificationStatus === 'approved' &&
    profile.listingStatus === 'published'
  )
}

export function isRelationshipActive(relationship: TrainerRelationship | null | undefined): boolean {
  return Boolean(
    relationship &&
      relationship.status === 'active' &&
      !relationship.endedAt &&
      validTimestamp(relationship.createdAt) &&
      relationship.trainerAcceptedAt &&
      timestampAtOrAfter(relationship.trainerAcceptedAt, relationship.createdAt) &&
      relationship.traineeAcceptedAt &&
      timestampAtOrAfter(relationship.traineeAcceptedAt, relationship.createdAt) &&
      relationship.activatedAt &&
      timestampAtOrAfter(relationship.activatedAt, relationship.createdAt),
  )
}

export function createRelationshipRequest(input: {
  id: string
  trainerId: string
  traineeId: string
  initiatedBy: string
  createdAt: string
}): DomainResult<TrainerRelationship, RelationshipErrorCode> {
  if (input.trainerId === input.traineeId) return { ok: false, error: 'same_account' }
  if (input.initiatedBy !== input.trainerId && input.initiatedBy !== input.traineeId) {
    return { ok: false, error: 'actor_not_party' }
  }
  if (!validTimestamp(input.createdAt)) return { ok: false, error: 'invalid_timestamp' }

  return {
    ok: true,
    value: {
      id: input.id,
      trainerId: input.trainerId,
      traineeId: input.traineeId,
      initiatedBy: input.initiatedBy,
      status: 'pending',
      trainerAcceptedAt: input.initiatedBy === input.trainerId ? input.createdAt : null,
      traineeAcceptedAt: input.initiatedBy === input.traineeId ? input.createdAt : null,
      activatedAt: null,
      endedAt: null,
      endedBy: null,
      createdAt: input.createdAt,
    },
  }
}

export function acceptRelationship(
  relationship: TrainerRelationship,
  actorId: string,
  acceptedAt: string,
): DomainResult<TrainerRelationship, RelationshipErrorCode> {
  if (actorId !== relationship.trainerId && actorId !== relationship.traineeId) {
    return { ok: false, error: 'actor_not_party' }
  }
  if (relationship.status !== 'pending') return { ok: false, error: 'invalid_status' }
  if (!validTimestamp(acceptedAt)) return { ok: false, error: 'invalid_timestamp' }
  if (!timestampAtOrAfter(acceptedAt, relationship.createdAt)) {
    return { ok: false, error: 'timestamp_before_created' }
  }
  if (
    (actorId === relationship.trainerId && relationship.trainerAcceptedAt) ||
    (actorId === relationship.traineeId && relationship.traineeAcceptedAt)
  ) {
    return { ok: false, error: 'already_accepted' }
  }

  const next: TrainerRelationship = {
    ...relationship,
    trainerAcceptedAt:
      actorId === relationship.trainerId ? acceptedAt : relationship.trainerAcceptedAt,
    traineeAcceptedAt:
      actorId === relationship.traineeId ? acceptedAt : relationship.traineeAcceptedAt,
  }
  const bothAccepted = Boolean(next.trainerAcceptedAt && next.traineeAcceptedAt)
  return {
    ok: true,
    value: {
      ...next,
      status: bothAccepted ? 'active' : 'pending',
      activatedAt: bothAccepted ? acceptedAt : null,
    },
  }
}

export function declineRelationship(
  relationship: TrainerRelationship,
  actorId: string,
  declinedAt: string,
): DomainResult<TrainerRelationship, RelationshipErrorCode> {
  if (actorId !== relationship.trainerId && actorId !== relationship.traineeId) {
    return { ok: false, error: 'actor_not_party' }
  }
  if (relationship.status !== 'pending') return { ok: false, error: 'invalid_status' }
  if (actorId === relationship.initiatedBy) {
    return { ok: false, error: 'initiator_cannot_decline' }
  }
  if (!validTimestamp(declinedAt)) return { ok: false, error: 'invalid_timestamp' }
  if (!timestampAtOrAfter(declinedAt, relationship.createdAt)) {
    return { ok: false, error: 'timestamp_before_created' }
  }
  return {
    ok: true,
    value: {
      ...relationship,
      status: 'declined',
      endedAt: declinedAt,
      endedBy: actorId,
    },
  }
}

export function endRelationship(
  relationship: TrainerRelationship,
  actorId: string,
  endedAt: string,
): DomainResult<TrainerRelationship, RelationshipErrorCode> {
  if (actorId !== relationship.trainerId && actorId !== relationship.traineeId) {
    return { ok: false, error: 'actor_not_party' }
  }
  if (relationship.status !== 'pending' && relationship.status !== 'active') {
    return { ok: false, error: 'invalid_status' }
  }
  if (!validTimestamp(endedAt)) return { ok: false, error: 'invalid_timestamp' }
  if (!timestampAtOrAfter(endedAt, relationship.createdAt)) {
    return { ok: false, error: 'timestamp_before_created' }
  }
  return {
    ok: true,
    value: {
      ...relationship,
      status: 'ended',
      endedAt,
      endedBy: actorId,
    },
  }
}

function relationshipMatches(
  actorId: string,
  traineeId: string,
  relationship: TrainerRelationship | null | undefined,
): relationship is TrainerRelationship {
  return Boolean(
    relationship &&
      relationship.trainerId === actorId &&
      relationship.traineeId === traineeId &&
      isRelationshipActive(relationship),
  )
}

export function canAssignWorkoutPlan(input: {
  actorId: string
  traineeId: string
  routineOwnerId: string
  scheduledDate: string
  today: string
  trainerProfile: TrainerProfileState | null | undefined
  relationship: TrainerRelationship | null | undefined
}): boolean {
  return (
    isTrainerApproved(input.trainerProfile) &&
    input.trainerProfile?.userId === input.actorId &&
    input.routineOwnerId === input.actorId &&
    relationshipMatches(input.actorId, input.traineeId, input.relationship) &&
    isCalendarDate(input.today) &&
    isCalendarDate(input.scheduledDate) &&
    input.scheduledDate >= input.today
  )
}

export function isGrantEffective(input: {
  grant: TrainerAccessGrant | null | undefined
  relationship: TrainerRelationship | null | undefined
  permission: TrainerPermission
  resourceDate: string
}): boolean {
  const { grant, relationship, permission, resourceDate } = input
  if (!grant || !relationship || !isRelationshipActive(relationship)) return false
  if (grant.relationshipId !== relationship.id) return false
  if (grant.permission !== permission) return false
  if (grant.grantedBy !== relationship.traineeId) return false
  if (!validTimestamp(grant.grantedAt) || grant.revokedAt) return false
  if (!isCalendarDate(resourceDate)) return false
  if (grant.workoutDateFrom) {
    if (!isCalendarDate(grant.workoutDateFrom) || resourceDate < grant.workoutDateFrom) return false
  }
  if (grant.workoutDateTo) {
    if (!isCalendarDate(grant.workoutDateTo) || resourceDate > grant.workoutDateTo) return false
  }
  if (
    grant.workoutDateFrom &&
    grant.workoutDateTo &&
    grant.workoutDateFrom > grant.workoutDateTo
  ) {
    return false
  }
  return true
}

function canReadDelegatedResource(input: {
  actorId: string
  traineeId: string
  permission: TrainerPermission
  resourceDate: string
  trainerProfile: TrainerProfileState | null | undefined
  relationship: TrainerRelationship | null | undefined
  grant: TrainerAccessGrant | null | undefined
}): boolean {
  return (
    isTrainerApproved(input.trainerProfile) &&
    input.trainerProfile?.userId === input.actorId &&
    relationshipMatches(input.actorId, input.traineeId, input.relationship) &&
    isGrantEffective({
      grant: input.grant,
      relationship: input.relationship,
      permission: input.permission,
      resourceDate: input.resourceDate,
    })
  )
}

export function canReadWorkoutResult(input: {
  actorId: string
  resource: WorkoutResultResource
  trainerProfile?: TrainerProfileState | null
  relationship?: TrainerRelationship | null
  grant?: TrainerAccessGrant | null
}): boolean {
  if (input.actorId === input.resource.traineeId) return true
  if (input.resource.status !== 'completed') return false
  return canReadDelegatedResource({
    actorId: input.actorId,
    traineeId: input.resource.traineeId,
    permission: 'workout_results.read',
    resourceDate: input.resource.date,
    trainerProfile: input.trainerProfile,
    relationship: input.relationship,
    grant: input.grant,
  })
}

export function canReadBodyweight(input: {
  actorId: string
  resource: BodyweightResource
  trainerProfile?: TrainerProfileState | null
  relationship?: TrainerRelationship | null
  grant?: TrainerAccessGrant | null
}): boolean {
  if (input.actorId === input.resource.traineeId) return true
  return canReadDelegatedResource({
    actorId: input.actorId,
    traineeId: input.resource.traineeId,
    permission: 'bodyweight.read',
    resourceDate: input.resource.date,
    trainerProfile: input.trainerProfile,
    relationship: input.relationship,
    grant: input.grant,
  })
}

export function canViewWorkoutPlan(input: {
  actorId: string
  plan: WorkoutPlanResource
  trainerProfile?: TrainerProfileState | null
  relationship?: TrainerRelationship | null
}): boolean {
  if (input.actorId === input.plan.traineeId) return true
  return (
    input.plan.assignedBy === input.actorId &&
    input.plan.relationshipId === input.relationship?.id &&
    isTrainerApproved(input.trainerProfile) &&
    input.trainerProfile?.userId === input.actorId &&
    relationshipMatches(input.actorId, input.plan.traineeId, input.relationship)
  )
}

export function canCancelWorkoutPlan(input: {
  actorId: string
  plan: WorkoutPlanResource
  trainerProfile?: TrainerProfileState | null
  relationship?: TrainerRelationship | null
}): boolean {
  if (input.plan.status !== 'scheduled') return false
  return canViewWorkoutPlan(input)
}

export function canStartWorkoutPlan(actorId: string, plan: WorkoutPlanResource): boolean {
  return actorId === plan.traineeId && plan.status === 'scheduled'
}

function isNullableNonNegative(value: number | null): boolean {
  return value == null || (Number.isFinite(value) && value >= 0)
}

function isNullableNonNegativeInteger(value: number | null): boolean {
  return value == null || (Number.isInteger(value) && value >= 0)
}

function isValidPrescriptionExercise(exercise: RoutinePrescriptionExercise): boolean {
  return (
    Number.isInteger(exercise.exerciseId) &&
    exercise.exerciseId > 0 &&
    Number.isInteger(exercise.sets) &&
    exercise.sets >= 1 &&
    exercise.sets <= MAX_PRESCRIBED_SETS &&
    Number.isInteger(exercise.order) &&
    exercise.order >= 0 &&
    isNullableNonNegativeInteger(exercise.reps) &&
    isNullableNonNegative(exercise.weight) &&
    isNullableNonNegative(exercise.durationMinutes) &&
    isNullableNonNegative(exercise.distance) &&
    isNullableNonNegativeInteger(exercise.restSeconds) &&
    (exercise.tempo == null ||
      (exercise.tempo.length > 0 && exercise.tempo.length <= MAX_TEMPO_LENGTH)) &&
    (exercise.setDetails == null ||
      (exercise.setDetails.length === exercise.sets &&
        exercise.setDetails.length <= MAX_PRESCRIBED_SETS &&
        exercise.setDetails.every(
          (set) =>
            isNullableNonNegativeInteger(set.reps) && isNullableNonNegative(set.weight),
        )))
  )
}

export function buildWorkoutPlanSnapshot(input: {
  id: string
  traineeId: string
  assignedBy: string
  relationshipId: string | null
  scheduledDate: string
  routine: RoutinePrescription
}): DomainResult<WorkoutPlanSnapshot, PlanSnapshotErrorCode> {
  if (!isCalendarDate(input.scheduledDate)) return { ok: false, error: 'invalid_date' }
  const title = input.routine.name.trim()
  if (!title || title.length > MAX_PLAN_TITLE_LENGTH) {
    return { ok: false, error: 'invalid_title' }
  }
  if (input.routine.exercises.length === 0) return { ok: false, error: 'no_exercises' }
  if (input.routine.exercises.length > MAX_PLAN_EXERCISES) {
    return { ok: false, error: 'too_many_exercises' }
  }
  if (!input.routine.exercises.every(isValidPrescriptionExercise)) {
    return { ok: false, error: 'invalid_exercise' }
  }
  const orders = input.routine.exercises.map((exercise) => exercise.order)
  if (new Set(orders).size !== orders.length) return { ok: false, error: 'duplicate_order' }

  return {
    ok: true,
    value: {
      id: input.id,
      traineeId: input.traineeId,
      assignedBy: input.assignedBy,
      relationshipId: input.relationshipId,
      sourceRoutineId: input.routine.id,
      scheduledDate: input.scheduledDate,
      title,
      status: 'scheduled',
      exercises: [...input.routine.exercises]
        .sort((a, b) => a.order - b.order)
        .map((exercise) => ({
          ...exercise,
          setDetails: exercise.setDetails?.map((set) => ({ ...set })) ?? null,
        })),
    },
  }
}
