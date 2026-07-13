import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeSupabaseClient } from './fakes/supabase.mjs'

const {
  assignTrainerWorkoutCore,
  cancelWorkoutPlanCore,
  startWorkoutPlanCore,
} = await import('../src/app/actions/trainerPlanningCores.ts')
const { isTraineeAgendaPlan } = await import('../src/lib/trainerPlanningTypes.ts')

const RELATIONSHIP_ID = '6e57b73e-e7bf-4c5f-9f8e-c0b536f51b81'
const ROUTINE_ID = '19ee3335-95b5-4d78-a7b6-cf09a994dc01'
const PLAN_ID = '2f740539-3fc0-4e84-8ff7-df10a69145cf'

function form(values) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, String(value))
  return data
}

function assignmentForm(overrides = {}) {
  return form({
    relationshipId: RELATIONSHIP_ID,
    routineId: ROUTINE_ID,
    scheduledDate: '2026-08-14',
    title: '  Strength foundation  ',
    instructions: '  Keep two reps in reserve.  ',
    ...overrides,
  })
}

test('planning mutations authenticate before validation and make no RPC call when signed out', async () => {
  for (const invoke of [
    (client) => assignTrainerWorkoutCore(client, assignmentForm()),
    (client) => startWorkoutPlanCore(client, form({ planId: PLAN_ID })),
    (client) => cancelWorkoutPlanCore(client, form({ planId: PLAN_ID })),
  ]) {
    const fake = createFakeSupabaseClient({ user: null })
    const result = await invoke(fake)
    assert.equal(result.success, false)
    assert.match(result.message, /session/i)
    assert.equal(fake.mutationCount(undefined, 'rpc'), 0)
  }
})

test('assignment rejects malformed identifiers, dates, and bounded copy before the database', async () => {
  for (const invalid of [
    { relationshipId: 'not-a-uuid' },
    { routineId: 'not-a-uuid' },
    { scheduledDate: '14/08/2026' },
    { scheduledDate: '2026-02-30' },
    { title: 'x'.repeat(121) },
    { instructions: 'x'.repeat(2001) },
  ]) {
    const fake = createFakeSupabaseClient({ user: { id: 'trainer-a' } })
    const result = await assignTrainerWorkoutCore(fake, assignmentForm(invalid))
    assert.equal(result.success, false)
    assert.equal(fake.mutationCount(undefined, 'rpc'), 0)
  }
})

test('assignment sends only normalized prescription inputs to the hardened snapshot RPC', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'trainer-a' },
    rpcResults: { assign_workout_from_routine: { data: PLAN_ID, error: null } },
  })
  const result = await assignTrainerWorkoutCore(fake, assignmentForm())
  assert.deepEqual(result, {
    success: true,
    message: 'Workout assigned. The prescription is now a fixed snapshot.',
    planId: PLAN_ID,
  })
  assert.deepEqual(fake.mutationCalls('assign_workout_from_routine', 'rpc')[0].payload, {
    p_relationship_id: RELATIONSHIP_ID,
    p_routine_id: ROUTINE_ID,
    p_scheduled_date: '2026-08-14',
    p_title: 'Strength foundation',
    p_instructions: 'Keep two reps in reserve.',
  })
})

test('blank optional copy is represented as null so the routine name remains the snapshot title', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'trainer-a' },
    rpcResults: { assign_workout_from_routine: { data: PLAN_ID, error: null } },
  })
  await assignTrainerWorkoutCore(fake, assignmentForm({ title: '  ', instructions: '' }))
  const payload = fake.mutationCalls('assign_workout_from_routine', 'rpc')[0].payload
  assert.equal(payload.p_title, null)
  assert.equal(payload.p_instructions, null)
})

test('starting a plan returns only the linked workout id and uses the exact plan RPC', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'trainee-a' },
    rpcResults: { start_workout_plan: { data: 884, error: null } },
  })
  const result = await startWorkoutPlanCore(fake, form({ planId: PLAN_ID.toUpperCase() }))
  assert.deepEqual(result, {
    success: true,
    message: 'Workout started.',
    workoutId: 884,
  })
  assert.deepEqual(fake.mutationCalls('start_workout_plan', 'rpc')[0].payload, {
    p_plan_id: PLAN_ID,
  })
})

test('cancelling a plan invokes only the cancellation RPC', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'trainee-a' },
    rpcResults: { cancel_workout_plan: { data: null, error: null } },
  })
  const result = await cancelWorkoutPlanCore(fake, form({ planId: PLAN_ID }))
  assert.equal(result.success, true)
  assert.deepEqual(fake.mutationCalls('cancel_workout_plan', 'rpc')[0].payload, {
    p_plan_id: PLAN_ID,
  })
})

test('database authorization and internal failures are translated without leaking details', async () => {
  for (const error of [
    { code: '42501', message: 'private relationship id leaked' },
    { code: 'XX000', message: 'private.workout_plan_secret failed' },
  ]) {
    const fake = createFakeSupabaseClient({
      user: { id: 'trainer-a' },
      rpcResults: { assign_workout_from_routine: { data: null, error } },
    })
    const result = await assignTrainerWorkoutCore(fake, assignmentForm())
    assert.equal(result.success, false)
    assert.doesNotMatch(result.message, /private|relationship id|workout_plan_secret/i)
  }
})

test('dual-role users see only their trainee-owned plans in the personal agenda', () => {
  assert.equal(isTraineeAgendaPlan({ trainer_assigned: false, assigned_by_me: true }), true)
  assert.equal(isTraineeAgendaPlan({ trainer_assigned: true, assigned_by_me: false }), true)
  assert.equal(isTraineeAgendaPlan({ trainer_assigned: true, assigned_by_me: true }), false)
})
