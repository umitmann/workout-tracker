/**
 * RED tests for WP-04 — atomic, surfaced set persistence (ADR-0004 findings
 * C1/C2/H1/M8). Exercises saveWorkoutProgressCore/completeWorkoutCore against
 * the fake Supabase client (WP-01), asserting:
 *   - the RPC path is tried first and, on success, is the ONLY mutation —
 *     no separate delete/insert calls fire against the fake's `calls` log.
 *   - when the RPC is missing (PGRST202/42883), the client falls back to an
 *     ordering that can never leave the DB emptier on failure: insert the new
 *     snapshot BEFORE deleting the old one. If the fallback insert fails, no
 *     delete has been issued.
 *   - a genuine insert failure (not missing-function) surfaces {error} and
 *     never wipes existing sets.
 *
 * Run: node --import tsx --test .claude/test_atomic-persistence.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeSupabaseClient } from './fakes/supabase.mjs'

const { saveWorkoutProgressCore, completeWorkoutCore } = await import('../src/app/actions/cores.ts')

const SOME_SETS = [
  { exercise_id: 1, weight: 100, reps: 5 },
  { exercise_id: 1, weight: 90, reps: 8 },
]

const MISSING_FN_ERROR = { code: 'PGRST202', message: 'Could not find the function public.save_workout_sets' }

// ─── Happy path: RPC succeeds, no separate delete/insert ───────────────────

test('saveWorkoutProgress: RPC succeeds -> single rpc call, zero separate delete/insert on sets', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    rpcResults: { save_workout_sets: { data: null, error: null } },
  })
  const result = await saveWorkoutProgressCore(fake, 1, SOME_SETS)
  assert.deepEqual(result, { success: true })
  assert.equal(fake.mutationCount('save_workout_sets', 'rpc'), 1)
  assert.equal(fake.mutationCount('sets', 'delete'), 0)
  assert.equal(fake.mutationCount('sets', 'insert'), 0)
})

// ─── Fallback: RPC missing -> insert-before-delete, never emptier on failure ─

test('saveWorkoutProgress: RPC missing -> falls back, inserting the new snapshot BEFORE deleting the old one', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 1 === 1 ? 'u1' : 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    rpcResults: { save_workout_sets: { data: null, error: MISSING_FN_ERROR } },
    insertResults: { sets: { data: null, error: null } },
  })
  const result = await saveWorkoutProgressCore(fake, 1, SOME_SETS)
  assert.deepEqual(result, { success: true })
  const setsCalls = fake.mutationCalls('sets')
  assert.deepEqual(setsCalls.map((c) => c.method), ['insert', 'delete'], 'insert must precede delete in the fallback path')
})

test('saveWorkoutProgress: RPC missing + fallback insert fails -> {error}, and NO delete was issued (never leaves DB emptier)', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    rpcResults: { save_workout_sets: { data: null, error: MISSING_FN_ERROR } },
    insertResults: { sets: { data: null, error: { message: 'insert failed: connection reset' } } },
  })
  const result = await saveWorkoutProgressCore(fake, 1, SOME_SETS)
  assert.ok(result.error, 'must surface an error, not swallow it')
  assert.equal(fake.mutationCount('sets', 'delete'), 0, 'a failed fallback insert must never be followed by delete')
})

test('saveWorkoutProgress: a genuine (non-missing-function) RPC error surfaces {error} without any delete/insert fallback firing', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    rpcResults: { save_workout_sets: { data: null, error: { code: '23505', message: 'unique violation' } } },
  })
  const result = await saveWorkoutProgressCore(fake, 1, SOME_SETS)
  assert.ok(result.error)
  assert.equal(fake.mutationCount('sets', 'delete'), 0)
  assert.equal(fake.mutationCount('sets', 'insert'), 0)
})

test('saveWorkoutProgress: fallback insert succeeds but delete fails -> still {success:true} (stale extra rows are a lesser failure than data loss, and the next save self-heals since it replaces the whole snapshot)', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    rpcResults: { save_workout_sets: { data: null, error: MISSING_FN_ERROR } },
    insertResults: { sets: { data: null, error: null } },
    deleteResults: { sets: { data: null, error: { message: 'delete failed' } } },
  })
  const result = await saveWorkoutProgressCore(fake, 1, SOME_SETS)
  assert.deepEqual(result, { success: true })
})

// ─── completeWorkout follows the same atomicity contract ───────────────────

test('completeWorkout: RPC missing + fallback insert fails -> {error}, never updates status, no delete issued, no redirect', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    rpcResults: { save_workout_sets: { data: null, error: MISSING_FN_ERROR } },
    insertResults: { sets: { data: null, error: { message: 'insert failed' } } },
  })
  const result = await completeWorkoutCore(fake, 1, SOME_SETS)
  assert.ok(result?.error, 'must surface the failure instead of redirecting on a failed save')
  assert.equal(fake.mutationCount('workouts', 'update'), 0)
  assert.equal(fake.mutationCount('sets', 'delete'), 0)
})

test('completeWorkout: RPC succeeds -> status updated, single rpc call, no separate delete/insert', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    rpcResults: { save_workout_sets: { data: null, error: null } },
  })
  await assert.rejects(() => completeWorkoutCore(fake, 1, SOME_SETS)) // redirect() throws outside Next request scope
  assert.equal(fake.mutationCount('workouts', 'update'), 1)
  assert.equal(fake.mutationCount('save_workout_sets', 'rpc'), 1)
  assert.equal(fake.mutationCount('sets', 'delete'), 0)
  assert.equal(fake.mutationCount('sets', 'insert'), 0)
})

// ─── insertSets no longer swallows non-missing-column errors ───────────────

test('insertSets (via the fallback path): a non-missing-column insert error is surfaced, not swallowed', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    rpcResults: { save_workout_sets: { data: null, error: MISSING_FN_ERROR } },
    insertResults: { sets: { data: null, error: { message: 'permission denied for table sets' } } },
  })
  const result = await saveWorkoutProgressCore(fake, 1, SOME_SETS)
  assert.deepEqual(result, { error: 'permission denied for table sets' })
})
