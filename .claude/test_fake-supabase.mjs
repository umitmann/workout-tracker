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
