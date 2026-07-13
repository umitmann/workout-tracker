/**
 * Direct Supabase/RLS contract tests for the personal-trainer layer.
 *
 * These run only against a dedicated, pre-seeded test project. They are
 * intentionally not mocked: their job is to prove raw-table RLS and the
 * narrow delegated-results RPC with three real JWTs.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const enabled = process.env.PT_RLS_ENABLED === 'true'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required PT RLS environment variable: ${name}`)
  return value
}

function fixture() {
  return {
    url: required('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    traineeToken: required('PT_RLS_TRAINEE_ACCESS_TOKEN'),
    trainerToken: required('PT_RLS_TRAINER_ACCESS_TOKEN'),
    otherTrainerToken: required('PT_RLS_OTHER_TRAINER_ACCESS_TOKEN'),
    completedWorkoutId: Number(required('PT_RLS_COMPLETED_WORKOUT_ID')),
    inProgressWorkoutId: Number(required('PT_RLS_IN_PROGRESS_WORKOUT_ID')),
    activeGrantRelationshipId: required('PT_RLS_ACTIVE_GRANT_RELATIONSHIP_ID'),
    noGrantRelationshipId: required('PT_RLS_NO_GRANT_RELATIONSHIP_ID'),
    endedRelationshipId: required('PT_RLS_ENDED_RELATIONSHIP_ID'),
    bodyweightDate: required('PT_RLS_BODYWEIGHT_DATE'),
    bodyweightValue: Number(required('PT_RLS_BODYWEIGHT_VALUE')),
    from: required('PT_RLS_RANGE_FROM'),
    to: required('PT_RLS_RANGE_TO'),
  }
}

function asUser(url, anonKey, accessToken) {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

async function delegatedResults(client, relationshipId, from, to) {
  return client.rpc('trainer_get_completed_workouts', {
    p_relationship_id: relationshipId,
    p_from: from,
    p_to: to,
  })
}

async function delegatedSets(client, relationshipId, workoutId) {
  return client.rpc('trainer_get_completed_workout_sets', {
    p_relationship_id: relationshipId,
    p_workout_id: workoutId,
  })
}

async function delegatedBodyweights(client, relationshipId, from, to) {
  return client.rpc('trainer_get_bodyweights', {
    p_relationship_id: relationshipId,
    p_from: from,
    p_to: to,
  })
}

test('owner can read own raw workouts; trainers cannot bypass the delegated RPC', { skip: !enabled }, async () => {
  const f = fixture()
  const trainee = asUser(f.url, f.anonKey, f.traineeToken)
  const trainer = asUser(f.url, f.anonKey, f.trainerToken)
  const otherTrainer = asUser(f.url, f.anonKey, f.otherTrainerToken)
  const ids = [f.completedWorkoutId, f.inProgressWorkoutId]

  const ownerRead = await trainee.from('workouts').select('id,status').in('id', ids)
  assert.equal(ownerRead.error, null)
  assert.deepEqual(new Set((ownerRead.data ?? []).map((row) => Number(row.id))), new Set(ids))

  for (const actor of [trainer, otherTrainer]) {
    const rawRead = await actor.from('workouts').select('id,status').in('id', ids)
    assert.equal(rawRead.error, null)
    assert.deepEqual(rawRead.data, [], 'delegated actors must not receive raw workout-table SELECT')
  }
})

test('active result grant returns completed workouts only and a minimal DTO', { skip: !enabled }, async () => {
  const f = fixture()
  const trainer = asUser(f.url, f.anonKey, f.trainerToken)
  const result = await delegatedResults(
    trainer,
    f.activeGrantRelationshipId,
    f.from,
    f.to,
  )
  assert.equal(result.error, null)
  const rows = result.data ?? []
  assert.ok(rows.some((row) => Number(row.id) === f.completedWorkoutId))
  assert.ok(rows.every((row) => row.status === 'completed'))
  assert.ok(rows.every((row) => Number(row.id) !== f.inProgressWorkoutId))
  for (const row of rows) {
    assert.equal(Object.hasOwn(row, 'user_id'), false, 'auth-user ids are not part of the trainer DTO')
    assert.equal(Object.hasOwn(row, 'email'), false, 'account email is not part of the trainer DTO')
    assert.equal(Object.hasOwn(row, 'bodyweight'), false, 'workout grant does not bundle bodyweight')
  }
})

test('completed-workout detail returns result sets without account identity', { skip: !enabled }, async () => {
  const f = fixture()
  const trainer = asUser(f.url, f.anonKey, f.trainerToken)
  const result = await delegatedSets(
    trainer,
    f.activeGrantRelationshipId,
    f.completedWorkoutId,
  )
  assert.equal(result.error, null)
  assert.ok((result.data ?? []).length > 0)
  for (const row of result.data ?? []) {
    assert.equal(Number(row.workout_id), f.completedWorkoutId)
    assert.equal(Object.hasOwn(row, 'user_id'), false)
    assert.equal(Object.hasOwn(row, 'email'), false)
  }

  const hidden = await delegatedSets(
    trainer,
    f.activeGrantRelationshipId,
    f.inProgressWorkoutId,
  )
  assert.equal(hidden.error, null)
  assert.deepEqual(hidden.data, [])
})

test('independently granted bodyweight is bounded and excludes account identity', { skip: !enabled }, async () => {
  const f = fixture()
  const trainer = asUser(f.url, f.anonKey, f.trainerToken)
  const result = await delegatedBodyweights(
    trainer,
    f.activeGrantRelationshipId,
    f.from,
    f.to,
  )
  assert.equal(result.error, null)
  const measurement = (result.data ?? []).find((row) => row.date === f.bodyweightDate)
  assert.ok(measurement, 'expected consent-covered bodyweight fixture')
  assert.equal(Number(measurement.weight), f.bodyweightValue)
  assert.equal(Object.hasOwn(measurement, 'user_id'), false)
  assert.equal(Object.hasOwn(measurement, 'email'), false)
})

test('unrelated trainer cannot use another trainer relationship id', { skip: !enabled }, async () => {
  const f = fixture()
  const otherTrainer = asUser(f.url, f.anonKey, f.otherTrainerToken)
  const result = await delegatedResults(
    otherTrainer,
    f.activeGrantRelationshipId,
    f.from,
    f.to,
  )
  assert.ok(result.error || !result.data?.length)
  assert.equal(result.data?.some((row) => Number(row.id) === f.completedWorkoutId) ?? false, false)
})

for (const [name, relationshipKey] of [
  ['active relationship without a result grant', 'noGrantRelationshipId'],
  ['ended relationship even if a historical grant row remains', 'endedRelationshipId'],
]) {
  test(`${name} returns no delegated results`, { skip: !enabled }, async () => {
    const f = fixture()
    const trainer = asUser(f.url, f.anonKey, f.trainerToken)
    const result = await delegatedResults(trainer, f[relationshipKey], f.from, f.to)
    assert.ok(result.error || !result.data?.length)
    assert.equal(result.data?.some((row) => Number(row.id) === f.completedWorkoutId) ?? false, false)
  })
}
