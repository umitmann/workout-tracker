/**
 * RED tests for WP-06 — server-action cores must never compute "today"
 * themselves; the date is always the caller-supplied value, verified at the
 * fake-Supabase insert-payload boundary (ADR-0005). Uses the WP-01 fake and
 * cores pattern (ADR-0006): action bodies live in cores.ts as
 * `<name>Core(supabase, ...)`, tested by injecting the fake as the first arg.
 *
 * Run: node --import tsx --test .claude/test_local-date-action-sites.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeSupabaseClient } from './fakes/supabase.mjs'

const {
  startWorkoutCore,
  startWorkoutFromTemplateCore,
} = await import('../src/app/actions/cores.ts')

// ─── startWorkoutCore ───────────────────────────────────────────────────────

test('startWorkoutCore: inserts the workout with exactly the caller-supplied date, not a server-computed one', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    insertResults: { workouts: { data: { id: 42 }, error: null } },
  })
  let threw = null
  try {
    await startWorkoutCore(fake, '2026-07-08')
  } catch (e) {
    threw = e // redirect() throws a Next.js control-flow error — expected
  }
  assert.ok(threw, 'expected redirect() to throw on success path')
  const inserts = fake.mutationCalls('workouts', 'insert')
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].payload.date, '2026-07-08')
  assert.equal(inserts[0].payload.status, 'in_progress')
})

test('startWorkoutCore: a different caller-supplied date produces exactly that date (no hidden "today" fallback)', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    insertResults: { workouts: { data: { id: 43 }, error: null } },
  })
  try {
    await startWorkoutCore(fake, '2019-01-01')
  } catch { /* redirect */ }
  const inserts = fake.mutationCalls('workouts', 'insert')
  assert.equal(inserts[0].payload.date, '2019-01-01')
})

test('startWorkoutCore: no user -> redirects without inserting', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  let threw = false
  try {
    await startWorkoutCore(fake, '2026-07-08')
  } catch {
    threw = true
  }
  assert.equal(threw, true)
  assert.equal(fake.mutationCount('workouts', 'insert'), 0)
})

test('startWorkoutCore: insert failure redirects to dashboard without throwing an unhandled error', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    insertResults: { workouts: { data: null, error: { message: 'boom' } } },
  })
  let threw = false
  try {
    await startWorkoutCore(fake, '2026-07-08')
  } catch {
    threw = true // redirect('/dashboard') still throws the Next.js control-flow error
  }
  assert.equal(threw, true)
})

// ─── startWorkoutFromTemplateCore ──────────────────────────────────────────

test('startWorkoutFromTemplateCore: inserts with the caller-supplied date and template id', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    insertResults: { workouts: { data: { id: 44 }, error: null } },
  })
  try {
    await startWorkoutFromTemplateCore(fake, 7, '2026-12-25')
  } catch { /* redirect */ }
  const inserts = fake.mutationCalls('workouts', 'insert')
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].payload.date, '2026-12-25')
  assert.equal(inserts[0].payload.template_id, 7)
})

test('startWorkoutFromTemplateCore: no user -> redirects without inserting', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  let threw = false
  try {
    await startWorkoutFromTemplateCore(fake, 7, '2026-12-25')
  } catch {
    threw = true
  }
  assert.equal(threw, true)
  assert.equal(fake.mutationCount('workouts', 'insert'), 0)
})

test('startWorkoutFromTemplateCore: string template id (UUID) passes through untouched — never coerced with Number()', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    insertResults: { workouts: { data: { id: 45 }, error: null } },
  })
  const uuid = '550e8400-e29b-41d4-a716-446655440000'
  try {
    await startWorkoutFromTemplateCore(fake, uuid, '2026-07-08')
  } catch { /* redirect */ }
  const inserts = fake.mutationCalls('workouts', 'insert')
  assert.equal(inserts[0].payload.template_id, uuid)
})
