/**
 * Unit tests for D3 — per-set difficulty rating (Tile 10c).
 * Covers: the isMissingColumnError('difficulty') detection, the graceful
 * degrade of the client insert fallback (insertSets, via saveWorkoutProgressCore)
 * when `sets.difficulty` and/or `sets.rest_seconds` are not yet migrated, the
 * 1-5 range coercion in validateSet, and the pure setDifficulty LocalSet[] op.
 *
 * Run: node --import tsx --test .claude/test_difficulty-rating.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeSupabaseClient } from './fakes/supabase.mjs'

const { isMissingColumnError } = await import('../src/lib/schemaCompatibility.ts')
const { saveWorkoutProgressCore, validateSet } = await import('../src/app/actions/cores.ts')
const { setDifficulty } = await import('../src/lib/setListOps.ts')

const MISSING_FN_ERROR = { code: 'PGRST202', message: 'Could not find the function public.save_workout_sets' }
const MISSING_DIFFICULTY_COL = { code: '42703', message: 'column sets.difficulty does not exist' }
const MISSING_REST_COL = { code: '42703', message: 'column sets.rest_seconds does not exist' }

// ─── isMissingColumnError('difficulty') ─────────────────────────────────────

test('isMissingColumnError falls back to the bare Postgres code 42703 when no message is present', () => {
  assert.equal(isMissingColumnError({ code: '42703' }, 'difficulty'), true)
})

test('isMissingColumnError prefers the message over a same-code-but-different-column error (disambiguates two independently-missing optional columns)', () => {
  assert.equal(isMissingColumnError(MISSING_DIFFICULTY_COL, 'difficulty'), true)
  assert.equal(isMissingColumnError(MISSING_DIFFICULTY_COL, 'rest_seconds'), false)
})

test('isMissingColumnError detects a missing difficulty column by message text', () => {
  assert.equal(isMissingColumnError({ message: 'column "difficulty" of relation "sets" does not exist' }, 'difficulty'), true)
})

test('isMissingColumnError(..., "difficulty") does not fire for an unrelated missing-column error', () => {
  assert.equal(isMissingColumnError(MISSING_REST_COL, 'difficulty'), false)
})

// ─── validateSet: difficulty range coercion ─────────────────────────────────

test('validateSet keeps an in-range integer difficulty (1-5)', () => {
  for (const n of [1, 2, 3, 4, 5]) {
    assert.equal(validateSet({ difficulty: n }).difficulty, n)
  }
})

test('validateSet nulls out an out-of-range or non-integer difficulty rather than clamping it', () => {
  for (const bad of [0, 6, -1, 2.5, NaN, Infinity]) {
    assert.equal(validateSet({ difficulty: bad }).difficulty, null)
  }
})

test('validateSet leaves a null/undefined difficulty as null (optional everywhere)', () => {
  assert.equal(validateSet({ difficulty: null }).difficulty, null)
  assert.equal(validateSet({}).difficulty, null)
})

// ─── saveWorkoutProgressCore: difficulty threads through the RPC payload ───

test('saveWorkoutProgress: difficulty is included in the RPC p_sets payload, range-coerced', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    rpcResults: { save_workout_sets: { data: null, error: null } },
  })
  await saveWorkoutProgressCore(fake, 1, [
    { exercise_id: 1, weight: 100, reps: 5, difficulty: 4 },
    { exercise_id: 1, weight: 90, reps: 8, difficulty: 9 }, // out of range -> null
  ])
  const rpcCall = fake.mutationCalls('save_workout_sets', 'rpc')[0]
  assert.equal(rpcCall.payload.p_sets[0].difficulty, 4)
  assert.equal(rpcCall.payload.p_sets[1].difficulty, null)
})

// ─── Client fallback (insertSets): graceful degrade on a missing difficulty column ─

test('fallback insert: missing difficulty column -> stripped and retried -> succeeds', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    rpcResults: { save_workout_sets: { data: null, error: MISSING_FN_ERROR } },
    insertResults: {
      sets: [
        { data: null, error: MISSING_DIFFICULTY_COL },
        { data: [{ id: 7 }], error: null },
      ],
    },
  })
  const result = await saveWorkoutProgressCore(fake, 1, [{ exercise_id: 1, weight: 50, reps: 5, difficulty: 3 }])
  assert.deepEqual(result, { success: true })
  const inserts = fake.mutationCalls('sets', 'insert')
  assert.equal(inserts.length, 2)
  assert.equal('difficulty' in inserts[0].payload[0], true, 'first attempt still includes difficulty')
  assert.equal('difficulty' in inserts[1].payload[0], false, 'retry strips difficulty after the missing-column error')
})

test('fallback insert: BOTH rest_seconds and difficulty missing -> both stripped across retries -> succeeds', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    rpcResults: { save_workout_sets: { data: null, error: MISSING_FN_ERROR } },
    insertResults: {
      sets: [
        { data: null, error: MISSING_REST_COL },
        { data: null, error: MISSING_DIFFICULTY_COL },
        { data: [{ id: 9 }], error: null },
      ],
    },
  })
  const result = await saveWorkoutProgressCore(fake, 1, [{ exercise_id: 1, weight: 50, reps: 5, difficulty: 2, rest_seconds: 90 }])
  assert.deepEqual(result, { success: true })
  const inserts = fake.mutationCalls('sets', 'insert')
  assert.equal(inserts.length, 3)
  assert.equal('rest_seconds' in inserts[2].payload[0], false)
  assert.equal('difficulty' in inserts[2].payload[0], false)
})

test('fallback insert: a genuine (non-missing-column) error still surfaces, not swallowed by the degrade loop', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    rpcResults: { save_workout_sets: { data: null, error: MISSING_FN_ERROR } },
    insertResults: { sets: { data: null, error: { message: 'permission denied for table sets' } } },
  })
  const result = await saveWorkoutProgressCore(fake, 1, [{ exercise_id: 1, weight: 50, reps: 5, difficulty: 2 }])
  assert.deepEqual(result, { error: 'permission denied for table sets' })
})

// ─── setDifficulty (pure LocalSet[] op) ─────────────────────────────────────

function set(overrides = {}) {
  return {
    localId: overrides.localId ?? 'id',
    exerciseId: overrides.exerciseId ?? 1,
    exerciseName: overrides.exerciseName ?? 'Bench Press',
    exerciseCategory: overrides.exerciseCategory ?? null,
    weight: overrides.weight ?? null,
    reps: overrides.reps ?? null,
    duration_minutes: overrides.duration_minutes ?? null,
    distance: overrides.distance ?? null,
    rest_seconds: overrides.rest_seconds ?? null,
    difficulty: overrides.difficulty ?? null,
    done: overrides.done ?? true,
  }
}

test('setDifficulty sets the difficulty on the target set only', () => {
  const sets = [set({ localId: 'a' }), set({ localId: 'b' })]
  const next = setDifficulty(sets, 'a', 4)
  assert.equal(next.find((s) => s.localId === 'a').difficulty, 4)
  assert.equal(next.find((s) => s.localId === 'b').difficulty, null)
})

test('setDifficulty is editable after the fact — a second tap with a new value overwrites the old one', () => {
  const sets = [set({ localId: 'a', difficulty: 2 })]
  const next = setDifficulty(sets, 'a', 5)
  assert.equal(next[0].difficulty, 5)
})

test('setDifficulty re-tapping the already-selected value clears it back to null', () => {
  const sets = [set({ localId: 'a', difficulty: 3 })]
  const next = setDifficulty(sets, 'a', 3)
  assert.equal(next[0].difficulty, null)
})

test('setDifficulty never touches `done` — tappable before or after a set is completed', () => {
  const notDone = [set({ localId: 'a', done: false })]
  const next = setDifficulty(notDone, 'a', 1)
  assert.equal(next[0].done, false)
})
