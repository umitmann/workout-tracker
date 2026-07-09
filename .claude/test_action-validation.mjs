/**
 * RED tests for WP-05 — server-action input validation + remaining guard
 * coverage (notes.ts, bodyweight.ts, reports.ts).
 * Run: node --import tsx --test .claude/test_action-validation.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeSupabaseClient } from './fakes/supabase.mjs'

const {
  addSetCore,
  saveWorkoutProgressCore,
  completeWorkoutCore,
  saveExerciseNoteCore,
  logBodyWeightCore,
  validateSet,
} = await import('../src/app/actions/cores.ts')

// ─── validateSet() — shared field semantics ────────────────────────────────
// Convention (matches logBodyWeight's `Number.isFinite(weight) && weight > 0`
// at bodyweight.ts:24): every numeric field is independently checked with
// Number.isFinite. Non-finite values (NaN, Infinity, -Infinity) are REJECTED
// per-field — coerced to null — rather than rejecting the whole payload,
// because null is itself a legitimate value for weight/reps (§4.7/§4.8:
// "displays — for weight/reps"). reps and duration_minutes/distance must
// also be > 0 when present (a negative rep count or duration is never
// legitimate); weight may be 0 or positive but not negative (a 0kg/bodyweight
// set is legitimate, checklist §19 bodyweight exercises).

test('validateSet: NaN weight is coerced to null, valid reps kept', () => {
  const out = validateSet({ exercise_id: 1, weight: NaN, reps: 5 })
  assert.equal(out.weight, null)
  assert.equal(out.reps, 5)
})

test('validateSet: negative reps coerced to null', () => {
  const out = validateSet({ exercise_id: 1, weight: 100, reps: -5 })
  assert.equal(out.reps, null)
  assert.equal(out.weight, 100)
})

test('validateSet: Infinity duration_minutes coerced to null', () => {
  const out = validateSet({ exercise_id: 1, weight: null, reps: null, duration_minutes: Infinity })
  assert.equal(out.duration_minutes, null)
})

test('validateSet: -Infinity distance coerced to null', () => {
  const out = validateSet({ exercise_id: 1, weight: null, reps: null, distance: -Infinity })
  assert.equal(out.distance, null)
})

test('validateSet: null weight/reps stay null (legitimate, §4.7/§4.8) — not coerced away', () => {
  const out = validateSet({ exercise_id: 1, weight: null, reps: null })
  assert.equal(out.weight, null)
  assert.equal(out.reps, null)
})

test('validateSet: valid positive payload passes through unchanged', () => {
  const out = validateSet({ exercise_id: 1, weight: 82.5, reps: 8, duration_minutes: 12, distance: 3.2, rest_seconds: 90 })
  assert.deepEqual(out, { exercise_id: 1, weight: 82.5, reps: 8, duration_minutes: 12, distance: 3.2, rest_seconds: 90 })
})

test('validateSet: weight of exactly 0 is kept (bodyweight exercises)', () => {
  const out = validateSet({ exercise_id: 1, weight: 0, reps: 10 })
  assert.equal(out.weight, 0)
})

test('validateSet: negative weight coerced to null', () => {
  const out = validateSet({ exercise_id: 1, weight: -10, reps: 5 })
  assert.equal(out.weight, null)
})

test('validateSet: negative rest_seconds coerced to null', () => {
  const out = validateSet({ exercise_id: 1, weight: 100, reps: 5, rest_seconds: -30 })
  assert.equal(out.rest_seconds, null)
})

// ─── addSet applies validateSet before insert ──────────────────────────────

test('addSet: NaN weight is stripped to null before insert reaches the DB', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    insertResults: { sets: { data: { id: 42 }, error: null } },
  })
  const result = await addSetCore(fake, 1, 2, { weight: NaN, reps: -5 })
  assert.deepEqual(result, { id: 42 })
  const insertCalls = fake.mutationCalls('sets', 'insert')
  assert.equal(insertCalls.length, 1)
  assert.equal(insertCalls[0].payload.weight, null)
  assert.equal(insertCalls[0].payload.reps, null)
})

test('addSet: Infinity duration_minutes is stripped to null before insert', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    insertResults: { sets: { data: { id: 43 }, error: null } },
  })
  const result = await addSetCore(fake, 1, 2, { duration_minutes: Infinity, distance: 5 })
  assert.deepEqual(result, { id: 43 })
  const insertCalls = fake.mutationCalls('sets', 'insert')
  assert.equal(insertCalls[0].payload.duration_minutes, null)
  assert.equal(insertCalls[0].payload.distance, 5)
})

test('addSet: valid payload with legitimate nulls persists unchanged (no regression, §4.7/§4.8)', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    insertResults: { sets: { data: { id: 44 }, error: null } },
  })
  const result = await addSetCore(fake, 1, 2, { weight: null, reps: null })
  assert.deepEqual(result, { id: 44 })
  const insertCalls = fake.mutationCalls('sets', 'insert')
  assert.equal(insertCalls[0].payload.weight, null)
  assert.equal(insertCalls[0].payload.reps, null)
})

// ─── saveWorkoutProgress / completeWorkout apply validateSet before insert ─

test('saveWorkoutProgress: invalid numeric fields across multiple sets are sanitized before insert', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    insertResults: { sets: { data: null, error: null } },
  })
  const sets = [
    { exercise_id: 1, weight: NaN, reps: 8 },
    { exercise_id: 2, weight: 50, reps: Infinity },
    { exercise_id: 3, weight: null, reps: null }, // legitimate — untouched
  ]
  const result = await saveWorkoutProgressCore(fake, 1, sets)
  assert.deepEqual(result, { success: true })
  const insertCalls = fake.mutationCalls('sets', 'insert')
  assert.equal(insertCalls.length, 1)
  const rows = insertCalls[0].payload
  assert.equal(rows[0].weight, null)
  assert.equal(rows[0].reps, 8)
  assert.equal(rows[1].weight, 50)
  assert.equal(rows[1].reps, null)
  assert.equal(rows[2].weight, null)
  assert.equal(rows[2].reps, null)
})

test('completeWorkout: invalid numeric fields are sanitized before insert', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: { id: 1 }, error: null } },
    insertResults: { sets: { data: null, error: null }, workouts: { data: null, error: null } },
  })
  const sets = [{ exercise_id: 1, weight: -10, reps: 5 }]
  try {
    await completeWorkoutCore(fake, 1, sets)
  } catch (e) {
    // redirect() throws outside a real Next request scope — tolerate, as
    // test_action-guards.mjs does; the insert already happened by then.
    assert.match(String(e?.message ?? e), /NEXT_REDIRECT|static generation store/)
  }
  const insertCalls = fake.mutationCalls('sets', 'insert')
  assert.equal(insertCalls.length, 1)
  assert.equal(insertCalls[0].payload[0].weight, null)
})

// ─── notes.ts guard matrix ──────────────────────────────────────────────────

test('saveExerciseNote: no user -> Unauthorized, zero mutations', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  const result = await saveExerciseNoteCore(fake, 1, 'go heavier next time')
  assert.deepEqual(result, { error: 'Unauthorized' })
  assert.equal(fake.mutationCount('exercise_notes', 'upsert'), 0)
  assert.equal(fake.mutationCount('exercise_notes', 'delete'), 0)
})

test('saveExerciseNote: user present, non-empty note -> upserts trimmed note', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    upsertResults: { exercise_notes: { data: null, error: null } },
  })
  const result = await saveExerciseNoteCore(fake, 1, '  go heavier  ')
  assert.deepEqual(result, { success: true })
  const upserts = fake.mutationCalls('exercise_notes', 'upsert')
  assert.equal(upserts.length, 1)
  assert.equal(upserts[0].payload.note, 'go heavier')
})

test('saveExerciseNote: user present, empty note -> deletes rather than upserting', async () => {
  const fake = createFakeSupabaseClient({ user: { id: 'u1' } })
  const result = await saveExerciseNoteCore(fake, 1, '   ')
  assert.deepEqual(result, { success: true })
  assert.equal(fake.mutationCount('exercise_notes', 'delete'), 1)
  assert.equal(fake.mutationCount('exercise_notes', 'upsert'), 0)
})

// ─── bodyweight.ts guard matrix + validation ───────────────────────────────

test('logBodyWeight: no user -> Unauthorized, zero mutations', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  const result = await logBodyWeightCore(fake, 80)
  assert.deepEqual(result, { error: 'Unauthorized' })
  assert.equal(fake.mutationCount('body_weights', 'upsert'), 0)
})

test('logBodyWeight: NaN weight -> rejected with error, zero mutations (existing convention preserved)', async () => {
  const fake = createFakeSupabaseClient({ user: { id: 'u1' } })
  const result = await logBodyWeightCore(fake, NaN)
  assert.deepEqual(result, { error: 'Enter a valid weight' })
  assert.equal(fake.mutationCount('body_weights', 'upsert'), 0)
})

test('logBodyWeight: negative weight -> rejected with error, zero mutations', async () => {
  const fake = createFakeSupabaseClient({ user: { id: 'u1' } })
  const result = await logBodyWeightCore(fake, -5)
  assert.deepEqual(result, { error: 'Enter a valid weight' })
  assert.equal(fake.mutationCount('body_weights', 'upsert'), 0)
})

test('logBodyWeight: Infinity weight -> rejected with error, zero mutations', async () => {
  const fake = createFakeSupabaseClient({ user: { id: 'u1' } })
  const result = await logBodyWeightCore(fake, Infinity)
  assert.deepEqual(result, { error: 'Enter a valid weight' })
  assert.equal(fake.mutationCount('body_weights', 'upsert'), 0)
})

test('logBodyWeight: valid weight -> upserts, no regression', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    upsertResults: { body_weights: { data: null, error: null } },
  })
  // revalidatePath() throws outside a real Next.js request scope (no static
  // generation store in this node:test harness) — the mutation under test
  // happens before that call, so the fake's recorded call is already correct
  // by the time it throws. Same tolerance as test_action-guards.mjs.
  try {
    const result = await logBodyWeightCore(fake, 82.5, '2026-07-09')
    assert.deepEqual(result, { success: true })
  } catch (e) {
    assert.match(String(e?.message ?? e), /static generation store/)
  }
  const upserts = fake.mutationCalls('body_weights', 'upsert')
  assert.equal(upserts.length, 1)
  assert.equal(upserts[0].payload.weight, 82.5)
  assert.equal(upserts[0].payload.date, '2026-07-09')
})
