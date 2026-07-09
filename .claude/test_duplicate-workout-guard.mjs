/**
 * RED tests for WP-14 — duplicate-workout guard (Finding L1).
 *
 * Double-tapping "Start workout" (or otherwise calling startWorkout /
 * logWorkoutForDate twice for the same local date before the first request's
 * redirect lands) must not create a second `in_progress` workout with zero
 * sets. The guard looks up an existing in_progress, zero-set workout for
 * (user, date) before inserting; if found, it redirects to that workout
 * instead of inserting a duplicate.
 *
 * Scope: startWorkoutCore and logWorkoutForDateCore only (per test-plan.md
 * WP-14). scheduleWorkout (planned workouts) is a deliberately separate,
 * unguarded path — a user may legitimately want multiple planned workouts on
 * the same date, and "planned" workouts are not the in_progress duplication
 * problem described in Finding L1.
 *
 * Uses the WP-01 fake + cores pattern (ADR-0006): action bodies live in
 * cores.ts, tested by injecting the fake as the first arg.
 *
 * Run: node --import tsx --test .claude/test_duplicate-workout-guard.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeSupabaseClient } from './fakes/supabase.mjs'

const {
  startWorkoutCore,
  logWorkoutForDateCore,
} = await import('../src/app/actions/cores.ts')

async function expectRedirect(fn) {
  let threw = null
  try {
    await fn()
  } catch (e) {
    threw = e
  }
  assert.ok(threw, 'expected redirect() to throw (Next.js control-flow error)')
  return threw
}

// ─── startWorkoutCore ───────────────────────────────────────────────────────

test('startWorkoutCore: no existing in_progress workout for the date -> inserts normally', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: [], error: null } },
    insertResults: { workouts: { data: { id: 100 }, error: null } },
  })
  await expectRedirect(() => startWorkoutCore(fake, '2026-07-08'))
  assert.equal(fake.mutationCount('workouts', 'insert'), 1)
})

test('startWorkoutCore: existing in_progress + zero-set workout for the same date -> redirects to it, no insert', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    // Embedded sets() come back empty -> this candidate is reusable.
    selectResults: { workouts: { data: [{ id: 77, sets: [] }], error: null } },
  })
  const err = await expectRedirect(() => startWorkoutCore(fake, '2026-07-08'))
  assert.match(String(err?.digest ?? err?.message ?? err), /77/)
  assert.equal(fake.mutationCount('workouts', 'insert'), 0)
})

test('startWorkoutCore: calling twice for the same date -> only one insert total, second call reuses the first', async () => {
  // Simulate the double-tap: first call has no existing row and inserts;
  // second call's lookup now finds the row the first call just created.
  let inserted = false
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: {
      workouts: () => (inserted ? { data: [{ id: 999, sets: [] }], error: null } : { data: [], error: null }),
    },
    insertResults: {
      workouts: () => {
        inserted = true
        return { data: { id: 999 }, error: null }
      },
    },
  })

  await expectRedirect(() => startWorkoutCore(fake, '2026-07-08'))
  await expectRedirect(() => startWorkoutCore(fake, '2026-07-08'))

  assert.equal(fake.mutationCount('workouts', 'insert'), 1, 'exactly one insert across both calls')
})

test('startWorkoutCore: existing in_progress workout for the date already HAS sets -> not reused, inserts a new one', async () => {
  // A workout with sets is real, logged progress — never silently redirect
  // into it and never delete/overwrite it. The guard only reuses *empty*
  // in_progress workouts.
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: [{ id: 55, sets: [{ id: 1 }] }], error: null } },
    insertResults: { workouts: { data: { id: 56 }, error: null } },
  })
  const err = await expectRedirect(() => startWorkoutCore(fake, '2026-07-08'))
  assert.match(String(err?.digest ?? err?.message ?? err), /56/)
  assert.equal(fake.mutationCount('workouts', 'insert'), 1)
})

test('startWorkoutCore: multiple existing in_progress zero-set workouts for the date -> reuses one of them, never inserts', async () => {
  // Pathological pre-existing state (e.g. from before this guard existed).
  // Must not crash, must not insert a third.
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: [{ id: 10, sets: [] }, { id: 11, sets: [] }], error: null } },
  })
  const err = await expectRedirect(() => startWorkoutCore(fake, '2026-07-08'))
  assert.match(String(err?.digest ?? err?.message ?? err), /1[01]/)
  assert.equal(fake.mutationCount('workouts', 'insert'), 0)
})

test('startWorkoutCore: mixed existing rows (one with sets, one empty) for the date -> reuses the empty one, does not insert', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: {
      workouts: { data: [{ id: 20, sets: [{ id: 1 }] }, { id: 21, sets: [] }], error: null },
    },
  })
  const err = await expectRedirect(() => startWorkoutCore(fake, '2026-07-08'))
  assert.match(String(err?.digest ?? err?.message ?? err), /21/)
  assert.equal(fake.mutationCount('workouts', 'insert'), 0)
})

test('startWorkoutCore: lookup for a DIFFERENT date does not match -> inserts (guard is scoped per date)', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: {
      workouts: (call) => {
        const dateFilter = call.filters.find(([col]) => col === 'date')
        if (dateFilter && dateFilter[1] === '2026-07-08') {
          return { data: [{ id: 77, sets: [] }], error: null }
        }
        return { data: [], error: null }
      },
    },
    insertResults: { workouts: { data: { id: 78 }, error: null } },
  })
  const err = await expectRedirect(() => startWorkoutCore(fake, '2026-07-09'))
  assert.match(String(err?.digest ?? err?.message ?? err), /78/)
  assert.equal(fake.mutationCount('workouts', 'insert'), 1)
})

test('startWorkoutCore: existing lookup is scoped to the current user (no cross-user reuse)', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: {
      workouts: (call) => {
        const userFilter = call.filters.find(([col]) => col === 'user_id')
        assert.ok(userFilter, 'lookup must filter by user_id')
        assert.equal(userFilter[1], 'u1')
        return { data: [], error: null }
      },
    },
    insertResults: { workouts: { data: { id: 1 }, error: null } },
  })
  await expectRedirect(() => startWorkoutCore(fake, '2026-07-08'))
  assert.equal(fake.mutationCount('workouts', 'insert'), 1)
})

test('startWorkoutCore: lookup is scoped to status=in_progress (planned/completed rows for the date are ignored)', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: {
      workouts: (call) => {
        const statusFilter = call.filters.find(([col]) => col === 'status')
        assert.ok(statusFilter, 'lookup must filter by status')
        assert.equal(statusFilter[1], 'in_progress')
        return { data: [], error: null }
      },
    },
    insertResults: { workouts: { data: { id: 1 }, error: null } },
  })
  await expectRedirect(() => startWorkoutCore(fake, '2026-07-08'))
})

test('startWorkoutCore: lookup query fails (network/db error) -> falls back to inserting rather than throwing or hanging', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: null, error: { message: 'connection reset' } } },
    insertResults: { workouts: { data: { id: 900 }, error: null } },
  })
  const err = await expectRedirect(() => startWorkoutCore(fake, '2026-07-08'))
  assert.match(String(err?.digest ?? err?.message ?? err), /900/)
  assert.equal(fake.mutationCount('workouts', 'insert'), 1)
})

test('startWorkoutCore: lookup returns null data (not an array) -> treated as "no existing workout", inserts', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: null, error: null } },
    insertResults: { workouts: { data: { id: 901 }, error: null } },
  })
  const err = await expectRedirect(() => startWorkoutCore(fake, '2026-07-08'))
  assert.match(String(err?.digest ?? err?.message ?? err), /901/)
  assert.equal(fake.mutationCount('workouts', 'insert'), 1)
})

test('startWorkoutCore: existing row has sets:null/undefined (embed came back null, e.g. degraded query) -> treated as having no sets, reused', async () => {
  // Defensive: a null/undefined sets embed must not be mistaken for "has
  // sets" (which would insert a duplicate) or crash on .length.
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: [{ id: 33, sets: null }], error: null } },
  })
  const err = await expectRedirect(() => startWorkoutCore(fake, '2026-07-08'))
  assert.match(String(err?.digest ?? err?.message ?? err), /33/)
  assert.equal(fake.mutationCount('workouts', 'insert'), 0)
})

test('startWorkoutCore: no user -> redirects without inserting or looking up (guard does not leak a query pre-auth)', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  await expectRedirect(() => startWorkoutCore(fake, '2026-07-08'))
  assert.equal(fake.mutationCount('workouts', 'insert'), 0)
})

test('startWorkoutCore: insert failure after a failed reuse-lookup still redirects to dashboard, not throw unhandled', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: [], error: null } },
    insertResults: { workouts: { data: null, error: { message: 'boom' } } },
  })
  await expectRedirect(() => startWorkoutCore(fake, '2026-07-08'))
  assert.equal(fake.mutationCount('workouts', 'insert'), 1)
})

// ─── logWorkoutForDateCore ──────────────────────────────────────────────────

test('logWorkoutForDateCore: no existing in_progress workout for the date -> inserts normally', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: [], error: null } },
    insertResults: { workouts: { data: { id: 200 }, error: null } },
  })
  const err = await expectRedirect(() => logWorkoutForDateCore(fake, '2026-07-08'))
  assert.match(String(err?.digest ?? err?.message ?? err), /200/)
  assert.equal(fake.mutationCount('workouts', 'insert'), 1)
})

test('logWorkoutForDateCore: called twice for the same date -> second call reuses the existing empty workout, only one insert', async () => {
  let inserted = false
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: {
      workouts: () => (inserted ? { data: [{ id: 321, sets: [] }], error: null } : { data: [], error: null }),
    },
    insertResults: {
      workouts: () => {
        inserted = true
        return { data: { id: 321 }, error: null }
      },
    },
  })

  await expectRedirect(() => logWorkoutForDateCore(fake, '2026-07-08'))
  await expectRedirect(() => logWorkoutForDateCore(fake, '2026-07-08'))

  assert.equal(fake.mutationCount('workouts', 'insert'), 1)
})

test('logWorkoutForDateCore: existing zero-set workout has a DIFFERENT template_id than requested -> still reused (guard is date/status/empty-scoped, not template-scoped)', async () => {
  // Per spec this packet's guard is about avoiding duplicate *empty*
  // in_progress workouts for a date; it intentionally does not attempt to
  // reconcile which template the reused workout was originally tagged with.
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: [{ id: 44, sets: [] }], error: null } },
  })
  const err = await expectRedirect(() => logWorkoutForDateCore(fake, '2026-07-08', 'template-xyz'))
  assert.match(String(err?.digest ?? err?.message ?? err), /44/)
  assert.equal(fake.mutationCount('workouts', 'insert'), 0)
})

test('logWorkoutForDateCore: existing workout for the date has sets -> not reused, new workout inserted with the requested template_id', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: [{ id: 60, sets: [{ id: 5 }] }], error: null } },
    insertResults: { workouts: { data: { id: 61 }, error: null } },
  })
  const err = await expectRedirect(() => logWorkoutForDateCore(fake, '2026-07-08', 'tpl-1'))
  assert.match(String(err?.digest ?? err?.message ?? err), /61/)
  const inserts = fake.mutationCalls('workouts', 'insert')
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].payload.template_id, 'tpl-1')
})

test('logWorkoutForDateCore: no templateId argument -> template_id defaults to null on insert (unchanged pre-existing behaviour)', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: [], error: null } },
    insertResults: { workouts: { data: { id: 202 }, error: null } },
  })
  await expectRedirect(() => logWorkoutForDateCore(fake, '2026-07-08'))
  const inserts = fake.mutationCalls('workouts', 'insert')
  assert.equal(inserts[0].payload.template_id, null)
})

test('logWorkoutForDateCore: no user -> redirects without inserting or looking up', async () => {
  const fake = createFakeSupabaseClient({ user: null })
  await expectRedirect(() => logWorkoutForDateCore(fake, '2026-07-08'))
  assert.equal(fake.mutationCount('workouts', 'insert'), 0)
})

test('logWorkoutForDateCore: insert failure -> redirects to /workouts (pre-existing behaviour), not throw unhandled', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: [], error: null } },
    insertResults: { workouts: { data: null, error: { message: 'boom' } } },
  })
  const err = await expectRedirect(() => logWorkoutForDateCore(fake, '2026-07-08'))
  assert.match(String(err?.digest ?? err?.message ?? err), /workouts/)
})

test('logWorkoutForDateCore: lookup scoped to user_id + date + status=in_progress, same as startWorkoutCore', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u9' },
    selectResults: {
      workouts: (call) => {
        const userFilter = call.filters.find(([col]) => col === 'user_id')
        const statusFilter = call.filters.find(([col]) => col === 'status')
        const dateFilter = call.filters.find(([col]) => col === 'date')
        assert.equal(userFilter?.[1], 'u9')
        assert.equal(statusFilter?.[1], 'in_progress')
        assert.equal(dateFilter?.[1], '2026-03-03')
        return { data: [], error: null }
      },
    },
    insertResults: { workouts: { data: { id: 5 }, error: null } },
  })
  await expectRedirect(() => logWorkoutForDateCore(fake, '2026-03-03'))
})

// ─── Cross-cutting: startWorkoutCore and logWorkoutForDateCore do not share state ──

test('startWorkoutCore and logWorkoutForDateCore each look up independently -- one reusing a workout does not affect the other in the same test run', async () => {
  const fake = createFakeSupabaseClient({
    user: { id: 'u1' },
    selectResults: { workouts: { data: [{ id: 500, sets: [] }], error: null } },
  })
  const err1 = await expectRedirect(() => startWorkoutCore(fake, '2026-07-08'))
  assert.match(String(err1?.digest ?? err1?.message ?? err1), /500/)
  const err2 = await expectRedirect(() => logWorkoutForDateCore(fake, '2026-07-08'))
  assert.match(String(err2?.digest ?? err2?.message ?? err2), /500/)
  assert.equal(fake.mutationCount('workouts', 'insert'), 0)
})
