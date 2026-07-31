import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeSupabaseClient } from './fakes/supabase.mjs'

const {
  assignTrainerWeekCore,
  chooseWorkoutPlanDateCore,
} = await import('../src/app/actions/trainerPlanningCores.ts')
const {
  isMonday,
  startOfLocalWeek,
  weeklyPlanAvailability,
} = await import('../src/lib/weeklyPlanning.ts')

const RELATIONSHIP_ID = '6e57b73e-e7bf-4c5f-9f8e-c0b536f51b81'
const ROUTINE_A = '19ee3335-95b5-4d78-a7b6-cf09a994dc01'
const ROUTINE_B = '16b53da2-f246-4fbd-a5d5-12164669b6c9'
const PLAN_ID = '2f740539-3fc0-4e84-8ff7-df10a69145cf'

function weeklyForm(overrides = {}) {
  const data = new FormData()
  data.set('relationshipId', RELATIONSHIP_ID)
  data.set('weekStart', '2026-08-10')
  data.append('routineId', ROUTINE_A)
  data.append('routineId', ROUTINE_B)
  data.set('instructions', 'Keep two reps in reserve.')
  for (const [key, value] of Object.entries(overrides)) {
    data.delete(key)
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, String(item))
  }
  return data
}

function choiceForm(planId = PLAN_ID, selectedDate = '2026-08-13') {
  const data = new FormData()
  data.set('planId', planId)
  data.set('selectedDate', selectedDate)
  return data
}

test('local week helpers stay calendar-safe and use Monday through Sunday', () => {
  assert.equal(startOfLocalWeek('2026-08-13'), '2026-08-10')
  assert.equal(startOfLocalWeek('2026-08-10'), '2026-08-10')
  assert.equal(startOfLocalWeek('2026-08-16'), '2026-08-10')
  assert.equal(isMonday('2026-08-10'), true)
  assert.equal(isMonday('2026-08-11'), false)
})

test('weekly availability distinguishes upcoming, available, and missed plans', () => {
  const plan = { week_start: '2026-08-10', week_end: '2026-08-16' }
  assert.equal(weeklyPlanAvailability(plan, '2026-08-09'), 'upcoming')
  assert.equal(weeklyPlanAvailability(plan, '2026-08-10'), 'available')
  assert.equal(weeklyPlanAvailability(plan, '2026-08-16'), 'available')
  assert.equal(weeklyPlanAvailability(plan, '2026-08-17'), 'missed')
})

test('weekly assignment authenticates before validation', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  const result = await assignTrainerWeekCore(fake, weeklyForm())
  assert.equal(result.success, false)
  assert.match(result.message, /session/i)
  assert.equal(fake.mutationCount(undefined, 'rpc'), 0)
})

test('weekly assignment rejects invalid week starts, empty lists, and more than seven sessions', async () => {
  for (const form of [
    weeklyForm({ weekStart: '2026-08-11' }),
    weeklyForm({ routineId: [] }),
    weeklyForm({ routineId: Array.from({ length: 8 }, () => ROUTINE_A) }),
    weeklyForm({ routineId: ['not-a-uuid'] }),
    weeklyForm({ instructions: 'x'.repeat(2001) }),
  ]) {
    const fake = createFakeSupabaseClient({ user: { id: 'trainer-a' } })
    const result = await assignTrainerWeekCore(fake, form)
    assert.equal(result.success, false)
    assert.equal(fake.mutationCount(undefined, 'rpc'), 0)
  }
})

test('weekly assignment preserves order and duplicate templates in one hardened RPC', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'trainer-a' },
    rpcResults: {
      assign_weekly_workouts_from_routines: { data: [PLAN_ID, ROUTINE_B], error: null },
    },
  })
  const result = await assignTrainerWeekCore(fake, weeklyForm({
    routineId: [ROUTINE_A, ROUTINE_A, ROUTINE_B],
    instructions: '  Keep two reps in reserve.  ',
  }))
  assert.equal(result.success, true)
  assert.equal(result.planCount, 2)
  assert.deepEqual(
    fake.mutationCalls('assign_weekly_workouts_from_routines', 'rpc')[0].payload,
    {
      p_relationship_id: RELATIONSHIP_ID,
      p_routine_ids: [ROUTINE_A, ROUTINE_A, ROUTINE_B],
      p_week_start: '2026-08-10',
      p_instructions: 'Keep two reps in reserve.',
    },
  )
})

test('only a normalized plan/date pair reaches the day-choice RPC', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'trainee-a' },
    rpcResults: { choose_workout_plan_date: { data: null, error: null } },
  })
  const result = await chooseWorkoutPlanDateCore(fake, choiceForm(PLAN_ID.toUpperCase()))
  assert.deepEqual(result, { success: true, message: 'Training day saved.' })
  assert.deepEqual(fake.mutationCalls('choose_workout_plan_date', 'rpc')[0].payload, {
    p_plan_id: PLAN_ID,
    p_selected_date: '2026-08-13',
  })
})

test('invalid day choices never reach the database', async () => {
  for (const form of [choiceForm('bad-id'), choiceForm(PLAN_ID, '13/08/2026')]) {
    const fake = createFakeSupabaseClient({ user: { id: 'trainee-a' } })
    const result = await chooseWorkoutPlanDateCore(fake, form)
    assert.equal(result.success, false)
    assert.equal(fake.mutationCount(undefined, 'rpc'), 0)
  }
})
