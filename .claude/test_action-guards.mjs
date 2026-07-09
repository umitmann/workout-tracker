/**
 * RED tests for WP-01 — action-core auth/ownership guards against a fake
 * Supabase client. Run:
 *   node --import tsx --test .claude/test_action-guards.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeSupabaseClient } from './fakes/supabase.mjs'

const {
  saveWorkoutProgressCore,
  completeWorkoutCore,
  addSetCore,
  deleteSetCore,
  saveTemplateExercisesCore,
} = await import('../src/app/actions/cores.ts')

const SOME_SETS = [{ exercise_id: 1, weight: 100, reps: 5 }]
const SOME_EXERCISES = [
  { exerciseId: 1, sets: 3, reps: 8, weight: 50, duration_minutes: null, distance: null, set_details: null, tempo: null, order: 0 },
]

// ─── saveWorkoutProgress ────────────────────────────────────────────────────

test('saveWorkoutProgress: no user -> Unauthorized, zero mutations', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  const result = await saveWorkoutProgressCore(fake, 1, SOME_SETS)
  assert.deepEqual(result, { error: 'Unauthorized' })
  assert.equal(fake.mutationCount('sets', 'delete'), 0)
  assert.equal(fake.mutationCount('sets', 'insert'), 0)
})

test('saveWorkoutProgress: ownership select returns null -> Not found, zero mutations', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: null, error: null } },
  })
  const result = await saveWorkoutProgressCore(fake, 1, SOME_SETS)
  assert.deepEqual(result, { error: 'Not found' })
  assert.equal(fake.mutationCount('sets', 'delete'), 0)
  assert.equal(fake.mutationCount('sets', 'insert'), 0)
})

test('saveWorkoutProgress: user present + ownership ok -> mutation proceeds via the atomic RPC (WP-04 · ADR-0004)', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    rpcResults: { save_workout_sets: { data: null, error: null } },
  })
  const result = await saveWorkoutProgressCore(fake, 1, SOME_SETS)
  assert.deepEqual(result, { success: true })
  // Atomicity (ADR-0004): the snapshot save is a single RPC call, not a
  // separate delete + insert pair — see .claude/test_atomic-persistence.mjs
  // for the full fallback/failure matrix.
  assert.equal(fake.mutationCount('save_workout_sets', 'rpc'), 1)
  assert.equal(fake.mutationCount('sets', 'delete'), 0)
  assert.equal(fake.mutationCount('sets', 'insert'), 0)
})

// ─── completeWorkout ────────────────────────────────────────────────────────

test('completeWorkout: no user -> never updates status', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  await assert.rejects(() => completeWorkoutCore(fake, 1, SOME_SETS))
  assert.equal(fake.mutationCount('workouts', 'update'), 0)
  assert.equal(fake.mutationCount('sets', 'delete'), 0)
  assert.equal(fake.mutationCount('sets', 'insert'), 0)
})

test('completeWorkout: no ownership -> never updates status', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: null, error: null } },
  })
  await assert.rejects(() => completeWorkoutCore(fake, 1, SOME_SETS))
  assert.equal(fake.mutationCount('workouts', 'update'), 0)
  assert.equal(fake.mutationCount('sets', 'delete'), 0)
  assert.equal(fake.mutationCount('sets', 'insert'), 0)
})

test('completeWorkout: guard failure redirect path still throws (redirect not swallowed)', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  let threw = false
  try {
    await completeWorkoutCore(fake, 1, SOME_SETS)
  } catch (e) {
    threw = true
    // Next.js redirect() throws a special control-flow error — just confirm it propagates.
    assert.ok(e)
  }
  assert.equal(threw, true)
})

// ─── addSet ─────────────────────────────────────────────────────────────────

test('addSet: no user -> Unauthorized, zero mutations', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  const result = await addSetCore(fake, 1, 2, { weight: 10, reps: 5 })
  assert.deepEqual(result, { error: 'Unauthorized' })
  assert.equal(fake.mutationCount('sets', 'insert'), 0)
})

test('addSet: no ownership -> Workout not found, zero mutations', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: null, error: null } },
  })
  const result = await addSetCore(fake, 1, 2, { weight: 10, reps: 5 })
  assert.deepEqual(result, { error: 'Workout not found' })
  assert.equal(fake.mutationCount('sets', 'insert'), 0)
})

test('addSet: user present + ownership ok -> insert proceeds, returns id', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    insertResults: { sets: { data: { id: 42 }, error: null } },
  })
  const result = await addSetCore(fake, 1, 2, { weight: 10, reps: 5 })
  assert.deepEqual(result, { id: 42 })
  assert.equal(fake.mutationCount('sets', 'insert'), 1)
})

// ─── saveTemplateExercises ──────────────────────────────────────────────────

test('saveTemplateExercises: no user -> Unauthorized, zero mutations, delete().eq("routine_id") never fires', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  const result = await saveTemplateExercisesCore(fake, 1, 'Push day', SOME_EXERCISES)
  assert.deepEqual(result, { error: 'Unauthorized' })
  assert.equal(fake.mutationCount('routine_exercises', 'delete'), 0)
  assert.equal(fake.mutationCount('routine_exercises', 'insert'), 0)
  assert.equal(fake.mutationCount('routines', 'update'), 0)
})

test('saveTemplateExercises: no ownership -> Not found, zero mutations, delete().eq("routine_id") never fires', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { routines: { data: null, error: null } },
  })
  const result = await saveTemplateExercisesCore(fake, 1, 'Push day', SOME_EXERCISES)
  assert.deepEqual(result, { error: 'Not found' })
  assert.equal(fake.mutationCount('routine_exercises', 'delete'), 0)
  assert.equal(fake.mutationCount('routine_exercises', 'insert'), 0)
  assert.equal(fake.mutationCount('routines', 'update'), 0)
})

test('saveTemplateExercises: user present + ownership ok -> delete().eq("routine_id") fires once before insert', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { routines: { data: { id: 1 }, error: null } },
    insertResults: { routine_exercises: { data: null, error: null } },
  })
  // revalidatePath() throws outside a real Next.js request scope (no static
  // generation store in this node:test harness) — the mutation work under
  // test happens before that call, so the fake's recorded calls are already
  // correct by the time it throws. Tolerate that specific, environment-only
  // failure rather than asserting the action's return value here.
  try {
    const result = await saveTemplateExercisesCore(fake, 1, 'Push day', SOME_EXERCISES)
    assert.deepEqual(result, { success: true })
  } catch (e) {
    assert.match(String(e?.message ?? e), /static generation store/)
  }
  const deleteCalls = fake.mutationCalls('routine_exercises', 'delete')
  assert.equal(deleteCalls.length, 1)
  assert.deepEqual(deleteCalls[0].filters, [['routine_id', 1]])
  const insertCalls = fake.mutationCalls('routine_exercises', 'insert')
  assert.equal(insertCalls.length, 1)
})

// ─── Robustness: guard matrix does not depend on payload shape ─────────────

test('addSet: no user -> guard short-circuits even with malformed data payload', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  const result = await addSetCore(fake, 1, 2, { weight: NaN, reps: undefined })
  assert.deepEqual(result, { error: 'Unauthorized' })
  assert.equal(fake.mutationCount('sets', 'insert'), 0)
})

test('saveWorkoutProgress: no user -> guard short-circuits even with empty sets array', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  const result = await saveWorkoutProgressCore(fake, 1, [])
  assert.deepEqual(result, { error: 'Unauthorized' })
  assert.equal(fake.mutationCount('sets', 'delete'), 0)
  assert.equal(fake.mutationCount('sets', 'insert'), 0)
})

test('saveTemplateExercises: no user -> guard short-circuits even with empty exercises array', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  const result = await saveTemplateExercisesCore(fake, 1, 'Empty', [])
  assert.deepEqual(result, { error: 'Unauthorized' })
  assert.equal(fake.mutationCount('routine_exercises', 'delete'), 0)
})

test('completeWorkout and saveWorkoutProgress: ownership check is scoped per-workout id, not shared state across calls', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: {
      workouts: (call) => {
        const idFilter = call.filters.find(([col]) => col === 'id')
        return idFilter && idFilter[1] === 1 ? { data: { id: 1 }, error: null } : { data: null, error: null }
      },
    },
    insertResults: { sets: { data: null, error: null } },
  })
  const ok = await saveWorkoutProgressCore(fake, 1, SOME_SETS)
  assert.deepEqual(ok, { success: true })
  const notFound = await saveWorkoutProgressCore(fake, 2, SOME_SETS)
  assert.deepEqual(notFound, { error: 'Not found' })
})

test('addSet: insert failure surfaces error message, no crash', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    insertResults: { sets: { data: null, error: { message: 'insert failed' } } },
  })
  const result = await addSetCore(fake, 1, 2, { weight: 10, reps: 5 })
  assert.deepEqual(result, { error: 'insert failed' })
})

// ─── deleteSet ──────────────────────────────────────────────────────────────

test('deleteSet: no user -> Unauthorized, zero mutations', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  const result = await deleteSetCore(fake, 5)
  assert.deepEqual(result, { error: 'Unauthorized' })
  assert.equal(fake.mutationCount('sets', 'delete'), 0)
})

test('deleteSet: user present -> delete fires scoped to both set id and user id', async () => {
  const fake = createFakeSupabaseClient({ user: { id: 'u1' } })
  const result = await deleteSetCore(fake, 5)
  assert.deepEqual(result, { success: true })
  const deletes = fake.mutationCalls('sets', 'delete')
  assert.equal(deletes.length, 1)
  assert.deepEqual(deletes[0].filters, [['id', 5], ['user_id', 'u1']])
})
