/**
 * Direct Supabase/JWT contract for the Phase 4 workout-plan migration.
 *
 * Run only against a disposable seeded project: the scenario intentionally
 * creates and starts one plan so it can prove the one-start invariant through
 * the real Data API rather than mocks.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const enabled = process.env.PT_PLANNING_RLS_ENABLED === 'true'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required PT planning variable: ${name}`)
  return value
}

function asUser(url, anonKey, accessToken) {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

test('trainer assignment is private, trainee-started, and exactly once', { skip: !enabled }, async () => {
  const url = required('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const trainer = asUser(url, anonKey, required('PT_PLANNING_TRAINER_ACCESS_TOKEN'))
  const trainee = asUser(url, anonKey, required('PT_PLANNING_TRAINEE_ACCESS_TOKEN'))
  const outsider = asUser(url, anonKey, required('PT_PLANNING_OUTSIDER_ACCESS_TOKEN'))
  const relationshipId = required('PT_PLANNING_ACTIVE_RELATIONSHIP_ID')
  const routineId = required('PT_PLANNING_TRAINER_ROUTINE_ID')
  const scheduledDate = required('PT_PLANNING_SCHEDULED_DATE')

  const raw = await trainer.from('workout_plans').select('*').limit(1)
  assert.ok(raw.error, 'authenticated users must have no base-table plan privilege')

  const assignment = await trainer.rpc('assign_workout_from_routine', {
    p_relationship_id: relationshipId,
    p_routine_id: routineId,
    p_scheduled_date: scheduledDate,
    p_title: `RLS plan ${scheduledDate}`,
    p_instructions: 'Disposable integration fixture',
  })
  assert.equal(assignment.error, null)
  assert.match(String(assignment.data), /^[0-9a-f-]{36}$/i)
  const planId = String(assignment.data)

  const outsiderRead = await outsider.rpc('get_workout_plan', { p_plan_id: planId })
  assert.equal(outsiderRead.error, null)
  assert.deepEqual(outsiderRead.data, [])

  const trainerStart = await trainer.rpc('start_workout_plan', { p_plan_id: planId })
  assert.ok(trainerStart.error, 'trainer must never start a trainee-owned workout')

  const traineeRead = await trainee.rpc('get_workout_plan', { p_plan_id: planId })
  assert.equal(traineeRead.error, null)
  assert.equal(traineeRead.data?.[0]?.status, 'scheduled')
  assert.ok((traineeRead.data?.[0]?.exercises ?? []).length > 0)

  const [firstStart, secondStart] = await Promise.all([
    trainee.rpc('start_workout_plan', { p_plan_id: planId }),
    trainee.rpc('start_workout_plan', { p_plan_id: planId }),
  ])
  const successes = [firstStart, secondStart].filter((result) => result.error === null)
  const failures = [firstStart, secondStart].filter((result) => result.error !== null)
  assert.equal(successes.length, 1)
  assert.equal(failures.length, 1)

  const workoutId = Number(successes[0].data)
  const linkedWorkout = await trainee
    .from('workouts')
    .select('id,user_id,date,status,plan_id')
    .eq('id', workoutId)
    .single()
  assert.equal(linkedWorkout.error, null)
  assert.equal(linkedWorkout.data?.date, scheduledDate)
  assert.equal(linkedWorkout.data?.status, 'in_progress')
  assert.equal(linkedWorkout.data?.plan_id, planId)
})
