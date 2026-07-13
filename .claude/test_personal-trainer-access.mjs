/**
 * Personal-trainer domain contract tests.
 *
 * These are deliberately pure and table-driven: they pin the authorization
 * matrix without mocking Next.js or Supabase. Database/RLS and browser suites
 * separately prove that their adapters enforce the same contract.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  MAX_PLAN_EXERCISES,
  MAX_PRESCRIBED_SETS,
  MAX_TEMPO_LENGTH,
  acceptRelationship,
  buildWorkoutPlanSnapshot,
  canAssignWorkoutPlan,
  canCancelWorkoutPlan,
  canReadBodyweight,
  canReadWorkoutResult,
  canStartWorkoutPlan,
  canViewWorkoutPlan,
  createRelationshipRequest,
  declineRelationship,
  endRelationship,
  isCalendarDate,
  isGrantEffective,
  isRelationshipActive,
  isTrainerDiscoverable,
} = await import('../src/lib/personalTrainerAccess.ts')

const CREATED_AT = '2026-07-13T08:00:00.000Z'
const ACCEPTED_AT = '2026-07-13T09:00:00.000Z'

function trainerProfile(overrides = {}) {
  return {
    userId: 'trainer-a',
    verificationStatus: 'approved',
    listingStatus: 'published',
    acceptingClients: true,
    ...overrides,
  }
}

function activeRelationship(overrides = {}) {
  return {
    id: 'relationship-a',
    trainerId: 'trainer-a',
    traineeId: 'trainee-a',
    initiatedBy: 'trainee-a',
    status: 'active',
    trainerAcceptedAt: ACCEPTED_AT,
    traineeAcceptedAt: CREATED_AT,
    activatedAt: ACCEPTED_AT,
    endedAt: null,
    endedBy: null,
    createdAt: CREATED_AT,
    ...overrides,
  }
}

function pendingRelationship(overrides = {}) {
  return {
    ...activeRelationship(),
    status: 'pending',
    trainerAcceptedAt: null,
    activatedAt: null,
    ...overrides,
  }
}

function accessGrant(permission = 'workout_results.read', overrides = {}) {
  return {
    relationshipId: 'relationship-a',
    permission,
    grantedBy: 'trainee-a',
    grantedAt: '2026-07-13T10:00:00.000Z',
    workoutDateFrom: null,
    workoutDateTo: null,
    revokedAt: null,
    revokedBy: null,
    ...overrides,
  }
}

function workoutResource(overrides = {}) {
  return {
    traineeId: 'trainee-a',
    date: '2026-07-13',
    status: 'completed',
    ...overrides,
  }
}

function planResource(overrides = {}) {
  return {
    traineeId: 'trainee-a',
    assignedBy: 'trainer-a',
    relationshipId: 'relationship-a',
    status: 'scheduled',
    ...overrides,
  }
}

function routine(overrides = {}) {
  return {
    id: 7,
    ownerId: 'trainer-a',
    name: ' Full Body A ',
    exercises: [
      {
        exerciseId: 11,
        sets: 2,
        reps: 8,
        weight: 80,
        durationMinutes: null,
        distance: null,
        setDetails: [
          { reps: 8, weight: 80 },
          { reps: 6, weight: 85 },
        ],
        tempo: '3-1-1-0',
        restSeconds: 90,
        order: 1,
      },
      {
        exerciseId: 12,
        sets: 2,
        reps: 10,
        weight: 30,
        durationMinutes: null,
        distance: null,
        setDetails: null,
        tempo: null,
        restSeconds: 60,
        order: 0,
      },
    ],
    ...overrides,
  }
}

function assertError(result, error) {
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, error)
}

// ─── Date and directory invariants ──────────────────────────────────────────

test('calendar date validation accepts real leap dates and rejects normalized/partial dates', () => {
  assert.equal(isCalendarDate('2028-02-29'), true)
  assert.equal(isCalendarDate('2027-02-29'), false)
  assert.equal(isCalendarDate('2026-02-30'), false)
  assert.equal(isCalendarDate('2026-7-13'), false)
  assert.equal(isCalendarDate('not-a-date'), false)
})

for (const [name, profile, expected] of [
  ['approved + published', trainerProfile(), true],
  ['approved + paused', trainerProfile({ listingStatus: 'paused' }), false],
  ['approved + draft', trainerProfile({ listingStatus: 'draft' }), false],
  ['pending + published', trainerProfile({ verificationStatus: 'pending' }), false],
  ['suspended + published', trainerProfile({ verificationStatus: 'suspended' }), false],
]) {
  test(`directory visibility: ${name} -> ${expected ? 'visible' : 'hidden'}`, () => {
    assert.equal(isTrainerDiscoverable(profile), expected)
  })
}

// ─── Relationship state machine ─────────────────────────────────────────────

test('a trainee-initiated request records only the trainee acceptance', () => {
  const result = createRelationshipRequest({
    id: 'r1',
    trainerId: 'trainer-a',
    traineeId: 'trainee-a',
    initiatedBy: 'trainee-a',
    createdAt: CREATED_AT,
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.status, 'pending')
  assert.equal(result.value.traineeAcceptedAt, CREATED_AT)
  assert.equal(result.value.trainerAcceptedAt, null)
  assert.equal(result.value.activatedAt, null)
})

test('a trainer-initiated request records only the trainer acceptance', () => {
  const result = createRelationshipRequest({
    id: 'r1',
    trainerId: 'trainer-a',
    traineeId: 'trainee-a',
    initiatedBy: 'trainer-a',
    createdAt: CREATED_AT,
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.trainerAcceptedAt, CREATED_AT)
  assert.equal(result.value.traineeAcceptedAt, null)
})

for (const [name, input, error] of [
  [
    'same account cannot be both trainer and trainee',
    { id: 'r', trainerId: 'same', traineeId: 'same', initiatedBy: 'same', createdAt: CREATED_AT },
    'same_account',
  ],
  [
    'unrelated actor cannot initiate',
    { id: 'r', trainerId: 'trainer-a', traineeId: 'trainee-a', initiatedBy: 'outsider', createdAt: CREATED_AT },
    'actor_not_party',
  ],
  [
    'invalid timestamp is rejected',
    { id: 'r', trainerId: 'trainer-a', traineeId: 'trainee-a', initiatedBy: 'trainee-a', createdAt: 'never' },
    'invalid_timestamp',
  ],
]) {
  test(`relationship request: ${name}`, () => assertError(createRelationshipRequest(input), error))
}

test('the invited party acceptance activates the relationship without mutating the input', () => {
  const original = pendingRelationship()
  const before = structuredClone(original)
  const result = acceptRelationship(original, 'trainer-a', ACCEPTED_AT)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.status, 'active')
  assert.equal(result.value.trainerAcceptedAt, ACCEPTED_AT)
  assert.equal(result.value.activatedAt, ACCEPTED_AT)
  assert.deepEqual(original, before)
})

for (const [name, relationship, actorId, timestamp, error] of [
  ['outsider', pendingRelationship(), 'outsider', ACCEPTED_AT, 'actor_not_party'],
  ['already-accepted initiator', pendingRelationship(), 'trainee-a', ACCEPTED_AT, 'already_accepted'],
  ['terminal relationship', activeRelationship(), 'trainer-a', ACCEPTED_AT, 'invalid_status'],
  ['before request creation', pendingRelationship(), 'trainer-a', '2026-07-12T23:00:00.000Z', 'timestamp_before_created'],
  ['malformed timestamp', pendingRelationship(), 'trainer-a', 'later', 'invalid_timestamp'],
]) {
  test(`relationship acceptance rejects ${name}`, () => {
    assertError(acceptRelationship(relationship, actorId, timestamp), error)
  })
}

test('only the invited party can decline a pending relationship', () => {
  const declined = declineRelationship(pendingRelationship(), 'trainer-a', ACCEPTED_AT)
  assert.equal(declined.ok, true)
  if (!declined.ok) return
  assert.equal(declined.value.status, 'declined')
  assert.equal(declined.value.endedBy, 'trainer-a')
  assert.equal(declined.value.endedAt, ACCEPTED_AT)

  assertError(
    declineRelationship(pendingRelationship(), 'trainee-a', ACCEPTED_AT),
    'initiator_cannot_decline',
  )
  assertError(
    declineRelationship(pendingRelationship(), 'outsider', ACCEPTED_AT),
    'actor_not_party',
  )
})

test('either party can end a pending or active relationship, but terminal states cannot transition again', () => {
  for (const [relationship, actor] of [
    [pendingRelationship(), 'trainee-a'],
    [activeRelationship(), 'trainer-a'],
  ]) {
    const result = endRelationship(relationship, actor, '2026-07-13T11:00:00.000Z')
    assert.equal(result.ok, true)
    if (!result.ok) continue
    assert.equal(result.value.status, 'ended')
    assert.equal(result.value.endedBy, actor)
    assertError(
      endRelationship(result.value, actor, '2026-07-13T12:00:00.000Z'),
      'invalid_status',
    )
  }
})

for (const [name, relationship, expected] of [
  ['fully active', activeRelationship(), true],
  ['pending', pendingRelationship(), false],
  ['missing trainer acceptance', activeRelationship({ trainerAcceptedAt: null }), false],
  ['missing trainee acceptance', activeRelationship({ traineeAcceptedAt: null }), false],
  ['missing activation timestamp', activeRelationship({ activatedAt: null }), false],
  ['malformed acceptance timestamp', activeRelationship({ trainerAcceptedAt: 'later' }), false],
  ['acceptance before creation', activeRelationship({ trainerAcceptedAt: '2026-07-12T23:00:00.000Z' }), false],
  ['activation before creation', activeRelationship({ activatedAt: '2026-07-12T23:00:00.000Z' }), false],
  ['ended flag on otherwise active row', activeRelationship({ endedAt: ACCEPTED_AT }), false],
]) {
  test(`active relationship invariant: ${name}`, () => {
    assert.equal(isRelationshipActive(relationship), expected)
  })
}

// ─── Assignment authorization ───────────────────────────────────────────────

const assignBase = {
  actorId: 'trainer-a',
  traineeId: 'trainee-a',
  routineOwnerId: 'trainer-a',
  scheduledDate: '2026-07-14',
  today: '2026-07-13',
  trainerProfile: trainerProfile(),
  relationship: activeRelationship(),
}

for (const [name, overrides, expected] of [
  ['approved active trainer, future date', {}, true],
  ['today is allowed', { scheduledDate: '2026-07-13' }, true],
  ['paused listing keeps existing client capability', { trainerProfile: trainerProfile({ listingStatus: 'paused' }) }, true],
  ['pending trainer verification', { trainerProfile: trainerProfile({ verificationStatus: 'pending' }) }, false],
  ['suspended trainer', { trainerProfile: trainerProfile({ verificationStatus: 'suspended' }) }, false],
  ['pending relationship', { relationship: pendingRelationship() }, false],
  ['ended relationship', { relationship: activeRelationship({ status: 'ended', endedAt: ACCEPTED_AT }) }, false],
  ['wrong trainee', { traineeId: 'trainee-b' }, false],
  ['routine owned by someone else', { routineOwnerId: 'trainer-b' }, false],
  ['past schedule', { scheduledDate: '2026-07-12' }, false],
  ['invalid schedule date', { scheduledDate: '2026-02-30' }, false],
]) {
  test(`assignment authorization: ${name}`, () => {
    assert.equal(canAssignWorkoutPlan({ ...assignBase, ...overrides }), expected)
  })
}

// ─── Grant and result authorization matrix ──────────────────────────────────

test('grant date scope is inclusive and invalid/revoked grants fail closed', () => {
  const relationship = activeRelationship()
  const scoped = accessGrant('workout_results.read', {
    workoutDateFrom: '2026-07-01',
    workoutDateTo: '2026-07-31',
  })
  for (const date of ['2026-07-01', '2026-07-15', '2026-07-31']) {
    assert.equal(
      isGrantEffective({ grant: scoped, relationship, permission: 'workout_results.read', resourceDate: date }),
      true,
    )
  }
  for (const date of ['2026-06-30', '2026-08-01']) {
    assert.equal(
      isGrantEffective({ grant: scoped, relationship, permission: 'workout_results.read', resourceDate: date }),
      false,
    )
  }
  assert.equal(
    isGrantEffective({
      grant: accessGrant('workout_results.read', { revokedAt: ACCEPTED_AT, revokedBy: 'trainee-a' }),
      relationship,
      permission: 'workout_results.read',
      resourceDate: '2026-07-13',
    }),
    false,
  )
  assert.equal(
    isGrantEffective({
      grant: accessGrant('workout_results.read', { workoutDateFrom: '2026-08-01', workoutDateTo: '2026-07-01' }),
      relationship,
      permission: 'workout_results.read',
      resourceDate: '2026-07-13',
    }),
    false,
  )
})

const readBase = {
  actorId: 'trainer-a',
  resource: workoutResource(),
  trainerProfile: trainerProfile(),
  relationship: activeRelationship(),
  grant: accessGrant(),
}

for (const [name, overrides, expected] of [
  ['active relationship + result grant + completed workout', {}, true],
  ['trainee always reads own completed workout', { actorId: 'trainee-a', trainerProfile: null, relationship: null, grant: null }, true],
  ['trainee reads own in-progress workout', { actorId: 'trainee-a', resource: workoutResource({ status: 'in_progress' }), trainerProfile: null, relationship: null, grant: null }, true],
  ['unrelated trainer', { actorId: 'trainer-b' }, false],
  ['pending relationship', { relationship: pendingRelationship() }, false],
  ['active relationship without grant', { grant: null }, false],
  ['bodyweight grant cannot read workouts', { grant: accessGrant('bodyweight.read') }, false],
  ['revoked grant', { grant: accessGrant('workout_results.read', { revokedAt: ACCEPTED_AT, revokedBy: 'trainee-a' }) }, false],
  ['grant issued by trainer is invalid', { grant: accessGrant('workout_results.read', { grantedBy: 'trainer-a' }) }, false],
  ['grant belongs to another relationship', { grant: accessGrant('workout_results.read', { relationshipId: 'other' }) }, false],
  ['in-progress is never shared', { resource: workoutResource({ status: 'in_progress' }) }, false],
  ['planned is never shared', { resource: workoutResource({ status: 'planned' }) }, false],
  ['suspended trainer', { trainerProfile: trainerProfile({ verificationStatus: 'suspended' }) }, false],
  ['ended relationship', { relationship: activeRelationship({ status: 'ended', endedAt: ACCEPTED_AT }) }, false],
  ['another trainee resource', { resource: workoutResource({ traineeId: 'trainee-b' }) }, false],
]) {
  test(`workout-result read: ${name}`, () => {
    assert.equal(canReadWorkoutResult({ ...readBase, ...overrides }), expected)
  })
}

test('bodyweight is independently authorized and a workout grant is insufficient', () => {
  const base = {
    actorId: 'trainer-a',
    resource: { traineeId: 'trainee-a', date: '2026-07-13' },
    trainerProfile: trainerProfile(),
    relationship: activeRelationship(),
  }
  assert.equal(canReadBodyweight({ ...base, grant: accessGrant('workout_results.read') }), false)
  assert.equal(canReadBodyweight({ ...base, grant: accessGrant('bodyweight.read') }), true)
  assert.equal(canReadBodyweight({ ...base, actorId: 'trainee-a', grant: null }), true)
})

// ─── Plan visibility and lifecycle ──────────────────────────────────────────

test('trainee owns plan visibility after relationship end; trainer access ends immediately', () => {
  const ended = activeRelationship({ status: 'ended', endedAt: ACCEPTED_AT })
  assert.equal(canViewWorkoutPlan({ actorId: 'trainee-a', plan: planResource(), relationship: ended }), true)
  assert.equal(
    canViewWorkoutPlan({ actorId: 'trainer-a', plan: planResource(), trainerProfile: trainerProfile(), relationship: ended }),
    false,
  )
})

test('only the trainee or assigning active trainer can cancel an unstarted plan', () => {
  const base = { plan: planResource(), trainerProfile: trainerProfile(), relationship: activeRelationship() }
  assert.equal(canCancelWorkoutPlan({ ...base, actorId: 'trainee-a' }), true)
  assert.equal(canCancelWorkoutPlan({ ...base, actorId: 'trainer-a' }), true)
  assert.equal(canCancelWorkoutPlan({ ...base, actorId: 'trainer-b' }), false)
  assert.equal(canCancelWorkoutPlan({ ...base, actorId: 'trainer-a', plan: planResource({ assignedBy: 'trainer-b' }) }), false)
  assert.equal(canCancelWorkoutPlan({ ...base, actorId: 'trainer-a', plan: planResource({ status: 'started' }) }), false)
  assert.equal(canCancelWorkoutPlan({ ...base, actorId: 'trainee-a', plan: planResource({ status: 'completed' }) }), false)
})

test('only the trainee can start a scheduled plan', () => {
  assert.equal(canStartWorkoutPlan('trainee-a', planResource()), true)
  assert.equal(canStartWorkoutPlan('trainer-a', planResource()), false)
  assert.equal(canStartWorkoutPlan('trainee-a', planResource({ status: 'started' })), false)
  assert.equal(canStartWorkoutPlan('trainee-a', planResource({ status: 'cancelled' })), false)
})

// ─── Immutable assignment snapshot ──────────────────────────────────────────

test('plan snapshot is ordered, trimmed, and detached from later routine edits', () => {
  const source = routine()
  const result = buildWorkoutPlanSnapshot({
    id: 'plan-1',
    traineeId: 'trainee-a',
    assignedBy: 'trainer-a',
    relationshipId: 'relationship-a',
    scheduledDate: '2026-07-14',
    routine: source,
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.title, 'Full Body A')
  assert.deepEqual(result.value.exercises.map((exercise) => exercise.order), [0, 1])
  assert.equal(result.value.exercises[1].setDetails[0].weight, 80)

  source.name = 'Changed later'
  source.exercises[0].weight = 999
  source.exercises[0].setDetails[0].weight = 999
  assert.equal(result.value.title, 'Full Body A')
  assert.equal(result.value.exercises[1].weight, 80)
  assert.equal(result.value.exercises[1].setDetails[0].weight, 80)
})

for (const [name, source, date, error] of [
  ['invalid scheduled date', routine(), '2026-02-30', 'invalid_date'],
  ['blank title', routine({ name: '   ' }), '2026-07-14', 'invalid_title'],
  ['overlong title', routine({ name: 'x'.repeat(121) }), '2026-07-14', 'invalid_title'],
  ['empty prescription', routine({ exercises: [] }), '2026-07-14', 'no_exercises'],
  [
    'too many exercises',
    routine({ exercises: Array.from({ length: MAX_PLAN_EXERCISES + 1 }, (_, order) => ({ ...routine().exercises[0], order })) }),
    '2026-07-14',
    'too_many_exercises',
  ],
  [
    'duplicate order',
    routine({ exercises: routine().exercises.map((exercise) => ({ ...exercise, order: 0 })) }),
    '2026-07-14',
    'duplicate_order',
  ],
  [
    'invalid exercise id',
    routine({ exercises: [{ ...routine().exercises[0], exerciseId: 0 }] }),
    '2026-07-14',
    'invalid_exercise',
  ],
  [
    'invalid prescribed set count',
    routine({ exercises: [{ ...routine().exercises[0], sets: 0 }] }),
    '2026-07-14',
    'invalid_exercise',
  ],
  [
    'negative prescription value',
    routine({ exercises: [{ ...routine().exercises[0], restSeconds: -1 }] }),
    '2026-07-14',
    'invalid_exercise',
  ],
  [
    'fractional reps',
    routine({ exercises: [{ ...routine().exercises[0], reps: 8.5 }] }),
    '2026-07-14',
    'invalid_exercise',
  ],
  [
    'per-set targets that do not match the declared set count',
    routine({ exercises: [{ ...routine().exercises[0], sets: 3 }] }),
    '2026-07-14',
    'invalid_exercise',
  ],
  [
    'oversized per-set target payload',
    routine({
      exercises: [{
        ...routine().exercises[0],
        sets: MAX_PRESCRIBED_SETS,
        setDetails: Array.from(
          { length: MAX_PRESCRIBED_SETS + 1 },
          () => ({ reps: 8, weight: 80 }),
        ),
      }],
    }),
    '2026-07-14',
    'invalid_exercise',
  ],
  [
    'oversized tempo payload',
    routine({ exercises: [{ ...routine().exercises[0], tempo: '1'.repeat(MAX_TEMPO_LENGTH + 1) }] }),
    '2026-07-14',
    'invalid_exercise',
  ],
]) {
  test(`plan snapshot rejects ${name}`, () => {
    assertError(
      buildWorkoutPlanSnapshot({
        id: 'plan-1',
        traineeId: 'trainee-a',
        assignedBy: 'trainer-a',
        relationshipId: 'relationship-a',
        scheduledDate: date,
        routine: source,
      }),
      error,
    )
  })
}
