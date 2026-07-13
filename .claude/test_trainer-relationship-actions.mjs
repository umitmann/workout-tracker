import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeSupabaseClient } from './fakes/supabase.mjs'

const {
  acceptTrainerRelationshipCore,
  declineTrainerRelationshipCore,
  endTrainerRelationshipCore,
  grantTrainerAccessCore,
  requestTrainerRelationshipCore,
  revokeTrainerAccessCore,
} = await import('../src/app/actions/trainerRelationshipCores.ts')

const PROFILE_ID = '19ee3335-95b5-4d78-a7b6-cf09a994dc01'
const RELATIONSHIP_ID = '6e57b73e-e7bf-4c5f-9f8e-c0b536f51b81'

function form(values) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, String(value))
  return data
}

function relationshipForm(id = RELATIONSHIP_ID) {
  return form({ relationshipId: id })
}

test('relationship actions authenticate before validation or any RPC', async () => {
  for (const invoke of [
    (fake) => requestTrainerRelationshipCore(fake, form({ trainerProfileId: PROFILE_ID })),
    (fake) => acceptTrainerRelationshipCore(fake, relationshipForm()),
    (fake) => declineTrainerRelationshipCore(fake, relationshipForm()),
    (fake) => endTrainerRelationshipCore(fake, relationshipForm()),
    (fake) => grantTrainerAccessCore(fake, form({
      relationshipId: RELATIONSHIP_ID,
      permission: 'workout_results.read',
      historyScope: 'from_now',
    })),
    (fake) => revokeTrainerAccessCore(fake, form({
      relationshipId: RELATIONSHIP_ID,
      permission: 'workout_results.read',
    })),
  ]) {
    const fake = createFakeSupabaseClient({ user: null })
    const result = await invoke(fake)
    assert.equal(result.success, false)
    assert.match(result.message, /session/i)
    assert.equal(fake.mutationCount(undefined, 'rpc'), 0)
  }
})
test('request validates the public trainer profile id and sends no account identity', async () => {
  const invalid = createFakeSupabaseClient({ user: { id: 'trainee-a' } })
  const rejected = await requestTrainerRelationshipCore(
    invalid,
    form({ trainerProfileId: 'not-a-uuid' }),
  )
  assert.equal(rejected.success, false)
  assert.equal(invalid.mutationCount(undefined, 'rpc'), 0)

  const fake = createFakeSupabaseClient({
    user: { id: 'trainee-a' },
    rpcResults: { request_trainer_relationship: { data: RELATIONSHIP_ID, error: null } },
  })
  const result = await requestTrainerRelationshipCore(
    fake,
    form({ trainerProfileId: `  ${PROFILE_ID.toUpperCase()}  ` }),
  )
  assert.equal(result.success, true)
  assert.deepEqual(fake.mutationCalls('request_trainer_relationship', 'rpc')[0].payload, {
    p_trainer_profile_id: PROFILE_ID,
  })
})

test('duplicate connection failures are translated without database leakage', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'trainee-a' },
    rpcResults: {
      request_trainer_relationship: {
        data: null,
        error: { code: '23505', message: 'trainer_relationships_one_current_pair_idx internal' },
      },
    },
  })
  const result = await requestTrainerRelationshipCore(
    fake,
    form({ trainerProfileId: PROFILE_ID }),
  )
  assert.equal(result.success, false)
  assert.match(result.message, /already (?:pending|connected)|existing request/i)
  assert.doesNotMatch(result.message, /trainer_relationships/i)
})

for (const [name, core, rpc] of [
  ['accept', acceptTrainerRelationshipCore, 'accept_trainer_relationship'],
  ['decline', declineTrainerRelationshipCore, 'decline_trainer_relationship'],
  ['end', endTrainerRelationshipCore, 'end_trainer_relationship'],
]) {
  test(`${name} validates the relationship id and invokes only its exact transition RPC`, async () => {
    const invalid = createFakeSupabaseClient({ user: { id: 'user-a' } })
    const rejected = await core(invalid, relationshipForm('bad-id'))
    assert.equal(rejected.success, false)
    assert.equal(invalid.mutationCount(undefined, 'rpc'), 0)

    const fake = createFakeSupabaseClient({
      user: { id: 'user-a' },
      rpcResults: { [rpc]: { data: null, error: null } },
    })
    const result = await core(fake, relationshipForm())
    assert.equal(result.success, true)
    assert.equal(fake.mutationCount(undefined, 'rpc'), 1)
    assert.deepEqual(fake.mutationCalls(rpc, 'rpc')[0].payload, {
      p_relationship_id: RELATIONSHIP_ID,
    })
  })
}

test('grant accepts only bounded permission/scope pairs and sends an exact payload', async () => {
  for (const values of [
    { relationshipId: 'bad', permission: 'workout_results.read', historyScope: 'all' },
    { relationshipId: RELATIONSHIP_ID, permission: 'workouts.write', historyScope: 'all' },
    { relationshipId: RELATIONSHIP_ID, permission: 'bodyweight.read', historyScope: 'forever' },
  ]) {
    const fake = createFakeSupabaseClient({ user: { id: 'trainee-a' } })
    const result = await grantTrainerAccessCore(fake, form(values))
    assert.equal(result.success, false)
    assert.equal(fake.mutationCount(undefined, 'rpc'), 0)
  }

  const fake = createFakeSupabaseClient({
    user: { id: 'trainee-a' },
    rpcResults: { grant_trainer_access: { data: PROFILE_ID, error: null } },
  })
  const result = await grantTrainerAccessCore(fake, form({
    relationshipId: RELATIONSHIP_ID,
    permission: 'workout_results.read',
    historyScope: 'from_now',
  }))
  assert.equal(result.success, true)
  assert.deepEqual(fake.mutationCalls('grant_trainer_access', 'rpc')[0].payload, {
    p_relationship_id: RELATIONSHIP_ID,
    p_permission: 'workout_results.read',
    p_history_scope: 'from_now',
  })
})

test('revoke accepts only bounded permissions and has no user-id argument', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'trainee-a' },
    rpcResults: { revoke_trainer_access: { data: null, error: null } },
  })
  const result = await revokeTrainerAccessCore(fake, form({
    relationshipId: RELATIONSHIP_ID,
    permission: 'bodyweight.read',
  }))
  assert.equal(result.success, true)
  assert.deepEqual(fake.mutationCalls('revoke_trainer_access', 'rpc')[0].payload, {
    p_relationship_id: RELATIONSHIP_ID,
    p_permission: 'bodyweight.read',
  })
})

test('database authorization and internal failures return safe action messages', async () => {
  for (const error of [
    { code: '42501', message: 'auth.users private id leaked' },
    { code: 'XX000', message: 'private.trainer_secret relation failed' },
  ]) {
    const fake = createFakeSupabaseClient({
      user: { id: 'user-a' },
      rpcResults: { end_trainer_relationship: { data: null, error } },
    })
    const result = await endTrainerRelationshipCore(fake, relationshipForm())
    assert.equal(result.success, false)
    assert.doesNotMatch(result.message, /auth\.users|trainer_secret/i)
  }
})
