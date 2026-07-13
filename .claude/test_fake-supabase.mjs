/**
 * Self-tests for the fake Supabase client (.claude/fakes/supabase.mjs) —
 * WP-01 · ADR-0006. Downstream packets (WP-04, WP-05, WP-14, ...) build on
 * this fake, so its edge-case behaviour is pinned here independently of any
 * one action.
 * Run: node --import tsx --test .claude/test_fake-supabase.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeSupabaseClient } from './fakes/supabase.mjs'

test('auth.getUser resolves null when no user configured', async () => {
  const fake = createFakeSupabaseClient()
  const { data } = await fake.auth.getUser()
  assert.equal(data.user, null)
})

test('auth.getUser resolves the configured user', async () => {
  const fake = createFakeSupabaseClient({ user: { id: 'u1' } })
  const { data } = await fake.auth.getUser()
  assert.deepEqual(data.user, { id: 'u1' })
})

test('select() with no filters resolves the configured default when awaited directly', async () => {
  const fake = createFakeSupabaseClient({ selectResults: { workouts: { data: [{ id: 1 }], error: null } } })
  const { data } = await fake.from('workouts').select('id')
  assert.deepEqual(data, [{ id: 1 }])
})

test('select().eq().eq().single() applies chained filters and returns configured result', async () => {
  const fake = createFakeSupabaseClient({ selectResults: { workouts: { data: { id: 5 }, error: null } } })
  const { data } = await fake.from('workouts').select('id').eq('id', 5).eq('user_id', 'u1').single()
  assert.deepEqual(data, { id: 5 })
})

test('select() calls are never recorded as mutations', async () => {
  const fake = createFakeSupabaseClient({ selectResults: { workouts: { data: { id: 1 }, error: null } } })
  await fake.from('workouts').select('id').eq('id', 1).single()
  assert.equal(fake.calls.length, 0)
})

test('insert records the call with its payload', async () => {
  const fake = createFakeSupabaseClient({ insertResults: { sets: { data: null, error: null } } })
  await fake.from('sets').insert([{ weight: 10 }])
  assert.equal(fake.mutationCount('sets', 'insert'), 1)
  assert.deepEqual(fake.mutationCalls('sets', 'insert')[0].payload, [{ weight: 10 }])
})

test('insert().select().single() still records exactly one insert call, not two', async () => {
  const fake = createFakeSupabaseClient({ insertResults: { sets: { data: { id: 9 }, error: null } } })
  const { data } = await fake.from('sets').insert({ weight: 10 }).select('id').single()
  assert.equal(fake.mutationCount('sets', 'insert'), 1)
  assert.deepEqual(data, { id: 9 })
})

test('update records the call with payload and filters, separately from insert/delete', async () => {
  const fake = createFakeSupabaseClient({ updateResults: { workouts: { data: null, error: null } } })
  await fake.from('workouts').update({ status: 'completed' }).eq('id', 1)
  assert.equal(fake.mutationCount('workouts', 'update'), 1)
  assert.equal(fake.mutationCount('workouts', 'insert'), 0)
  assert.equal(fake.mutationCount('workouts', 'delete'), 0)
  assert.deepEqual(fake.mutationCalls('workouts', 'update')[0].filters, [['id', 1]])
})

test('delete records the call and its filters', async () => {
  const fake = createFakeSupabaseClient()
  await fake.from('sets').delete().eq('workout_id', 42)
  const calls = fake.mutationCalls('sets', 'delete')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].filters, [['workout_id', 42]])
})

test('mutations across different tables do not cross-contaminate counts', async () => {
  const fake = createFakeSupabaseClient({
    insertResults: { sets: { data: null, error: null }, routine_exercises: { data: null, error: null } },
  })
  await fake.from('sets').insert({ a: 1 })
  await fake.from('routine_exercises').insert({ b: 2 })
  assert.equal(fake.mutationCount('sets', 'insert'), 1)
  assert.equal(fake.mutationCount('routine_exercises', 'insert'), 1)
  assert.equal(fake.mutationCount('sets'), 1)
  assert.equal(fake.mutationCount(), 2)
})

test('mutationCalls preserves call order across mixed methods', async () => {
  const fake = createFakeSupabaseClient({
    insertResults: { sets: { data: null, error: null } },
  })
  await fake.from('sets').delete().eq('workout_id', 1)
  await fake.from('sets').insert([{ weight: 5 }])
  assert.deepEqual(fake.calls.map((c) => c.method), ['delete', 'insert'])
})

test('array-configured results are consumed one per call, repeating the last', async () => {
  const fake = createFakeSupabaseClient({
    selectResults: {
      workouts: [{ data: { id: 1 }, error: null }, { data: null, error: null }],
    },
  })
  const first = await fake.from('workouts').select('id').eq('id', 1).single()
  const second = await fake.from('workouts').select('id').eq('id', 2).single()
  const third = await fake.from('workouts').select('id').eq('id', 3).single()
  assert.deepEqual(first.data, { id: 1 })
  assert.equal(second.data, null)
  assert.equal(third.data, null) // repeats last configured result once exhausted
})

test('function-configured results receive the recorded call for dynamic behaviour', async () => {
  const fake = createFakeSupabaseClient({
    selectResults: {
      workouts: (call) => {
        const idFilter = call.filters.find(([col]) => col === 'id')
        return { data: idFilter?.[1] === 7 ? { id: 7 } : null, error: null }
      },
    },
  })
  const hit = await fake.from('workouts').select('id').eq('id', 7).single()
  const miss = await fake.from('workouts').select('id').eq('id', 8).single()
  assert.deepEqual(hit.data, { id: 7 })
  assert.equal(miss.data, null)
})

test('unconfigured table/method defaults to { data: null, error: null } rather than throwing', async () => {
  const fake = createFakeSupabaseClient()
  const result = await fake.from('mystery_table').insert({ x: 1 })
  assert.deepEqual(result, { data: null, error: null })
})

test('missing user config (undefined) behaves the same as explicit null', async () => {
  const fake = createFakeSupabaseClient({})
  const { data } = await fake.auth.getUser()
  assert.equal(data.user, null)
})

// ─── rpc() — WP-04 ──────────────────────────────────────────────────────────

test('rpc() records the call under the function name, with its args as payload', async () => {
  const fake = createFakeSupabaseClient({ rpcResults: { save_workout_sets: { data: null, error: null } } })
  await fake.rpc('save_workout_sets', { p_workout_id: 1, p_sets: [] })
  assert.equal(fake.mutationCount('save_workout_sets', 'rpc'), 1)
  assert.deepEqual(fake.mutationCalls('save_workout_sets', 'rpc')[0].payload, { p_workout_id: 1, p_sets: [] })
})

test('rpc() returns the configured result', async () => {
  const fake = createFakeSupabaseClient({ rpcResults: { save_workout_sets: { data: { ok: true }, error: null } } })
  const { data, error } = await fake.rpc('save_workout_sets', {})
  assert.deepEqual(data, { ok: true })
  assert.equal(error, null)
})

test('rpc() on an unconfigured function name defaults to { data: null, error: null } rather than throwing', async () => {
  const fake = createFakeSupabaseClient()
  const result = await fake.rpc('mystery_fn', {})
  assert.deepEqual(result, { data: null, error: null })
})

test('rpc() supports sequenced (array) results, e.g. missing-function error then success on retry', async () => {
  const fake = createFakeSupabaseClient({
    rpcResults: {
      save_workout_sets: [
        { data: null, error: { code: 'PGRST202', message: 'function not found' } },
        { data: null, error: null },
      ],
    },
  })
  const first = await fake.rpc('save_workout_sets', {})
  const second = await fake.rpc('save_workout_sets', {})
  assert.equal(first.error.code, 'PGRST202')
  assert.equal(second.error, null)
})

test('not() records a distinguishable 3-tuple filter alongside eq()', async () => {
  const fake = createFakeSupabaseClient()
  await fake.from('sets').delete().eq('workout_id', 1).not('id', 'in', [7, 8])
  const call = fake.mutationCalls('sets', 'delete')[0]
  assert.deepEqual(call.filters, [['workout_id', 1], ['not', 'id', 'in', [7, 8]]])
})

test('in() records a distinguishable filter and order()/select() chain without side effects', async () => {
  const fake = createFakeSupabaseClient({ selectResults: { sets: { data: [], error: null } } })
  await fake.from('sets').select('id').in('workout_id', [1, 2]).order('id', { ascending: true })
  // select() calls are not recorded as mutations regardless of chained in()/order()
  assert.equal(fake.calls.length, 0)
})

test('rpc() calls interleave with table mutations in shared call order', async () => {
  const fake = createFakeSupabaseClient({
    rpcResults: { save_workout_sets: { data: null, error: { message: 'no fn' } } },
    insertResults: { sets: { data: null, error: null } },
  })
  await fake.rpc('save_workout_sets', {})
  await fake.from('sets').insert([{ a: 1 }])
  assert.deepEqual(fake.calls.map((c) => `${c.method}:${c.table}`), ['rpc:save_workout_sets', 'insert:sets'])
})

// ─── upsert (WP-05) ─────────────────────────────────────────────────────────

test('upsert records the call with its payload and onConflict option', async () => {
  const fake = createFakeSupabaseClient({ upsertResults: { body_weights: { data: null, error: null } } })
  await fake.from('body_weights').upsert({ user_id: 'u1', date: '2026-07-09', weight: 80 }, { onConflict: 'user_id,date' })
  assert.equal(fake.mutationCount('body_weights', 'upsert'), 1)
  const call = fake.mutationCalls('body_weights', 'upsert')[0]
  assert.deepEqual(call.payload, { user_id: 'u1', date: '2026-07-09', weight: 80 })
  assert.deepEqual(call.options, { onConflict: 'user_id,date' })
})

test('upsert is tracked separately from insert/update/delete counts', async () => {
  const fake = createFakeSupabaseClient({ upsertResults: { exercise_notes: { data: null, error: null } } })
  await fake.from('exercise_notes').upsert({ note: 'x' }, { onConflict: 'user_id,exercise_id' })
  assert.equal(fake.mutationCount('exercise_notes', 'upsert'), 1)
  assert.equal(fake.mutationCount('exercise_notes', 'insert'), 0)
  assert.equal(fake.mutationCount('exercise_notes', 'update'), 0)
})
