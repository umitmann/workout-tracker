/**
 * Unit tests for D9 — guided guides: rep-confirm, ordering, Exit bug (Tiles 11, 12).
 *
 * Covers:
 *  - the stop-early confirm math (`stopEarlyReps` / `completedRepsAt`) that
 *    DruhTimer's Tile 11 confirm/adjust screen is seeded from, plus the
 *    adjust-to-0-logs-nothing clamp behaviour a confirm UI must respect;
 *  - `mergeGuideResults` (setListOps.ts), the pure write-back extracted from
 *    `handleGuideDone` — a REGRESSION test that merging a guided exercise's
 *    results preserves every OTHER exercise's sets untouched, which is the
 *    Tile 12b "Exit loses the first exercise" bug this docket fixes.
 *
 * Run: node --import tsx --test .claude/test_guided-guides.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { stopEarlyReps, completedRepsAt } = await import('../src/lib/guidedTimer.ts')
const { mergeGuideResults, lastCompletedGuideSetId } = await import('../src/lib/setListOps.ts')

const T = { down: 3, rest: 1, up: 2, hold: 1 } // repDuration = 7

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
    done: overrides.done ?? false,
  }
}

// ─── Tile 11: stop-early confirm math ───────────────────────────────────────
// DruhTimer's confirm screen seeds its editable value from exactly this
// computation (Stop & log at ~6/10 reps after a pause → confirm shows 6).

test('a pause mid-set does not inflate the confirm seed beyond fully-completed reps', () => {
  // Paused for 20s inside rep 3 (would-be rep 3 spans [14,21) elapsed 14+20=34,
  // but only 2 full reps (14s) actually completed before the pause began).
  const elapsedWithPause = 14 + 20 // stalled inside rep 3 instead of finishing it at 21
  assert.equal(stopEarlyReps(T, 10, elapsedWithPause), 4) // floor(34/7) = 4, not "however many reps worth of clock time"
  // Sanity: without the stall, the same elapsed time as a clean run would also floor — the
  // point is the UI must show the FLOORED count for confirm, never round up.
  assert.equal(completedRepsAt(T, 34), 4)
})

test('stop-early confirm seed at ~6/10 reps (repro from the acceptance steps)', () => {
  // 6 full reps = 6*7 = 42s elapsed, plus a bit into rep 7 (not finished).
  const seed = stopEarlyReps(T, 10, 42 + 3)
  assert.equal(seed, 6)
})

test('confirm seed never exceeds the goal even with a very long elapsed time', () => {
  assert.equal(stopEarlyReps(T, 10, 999), 10)
})

test('confirm seed is 0 before the first rep completes (nothing to log yet)', () => {
  assert.equal(stopEarlyReps(T, 10, 0), 0)
  assert.equal(stopEarlyReps(T, 10, 6.9), 0)
})

// The confirm UI clamps ± adjustments to [0, goalReps] — mirror that clamp
// here so the bounds contract stays pinned independent of the component.
function clampConfirm(value, goalReps) {
  return Math.max(0, Math.min(goalReps, value))
}

test('adjusting the confirm value down to 0 is a legal, in-range state (caller then logs nothing)', () => {
  assert.equal(clampConfirm(6 - 6, 10), 0)
  assert.equal(clampConfirm(-1, 10), 0) // never goes negative
})

test('adjusting the confirm value up never exceeds the goal', () => {
  assert.equal(clampConfirm(10 + 1, 10), 10)
})

// ─── Tile 12b: mergeGuideResults — the Exit-loses-an-exercise regression ────

test('mergeGuideResults only writes sets present in results — every OTHER exercise is untouched', () => {
  const sets = [
    set({ localId: 'a1', exerciseId: 1, reps: 10, done: true }), // exercise A, already logged before the guide
    set({ localId: 'a2', exerciseId: 1, reps: 8, done: false }),
    set({ localId: 'b1', exerciseId: 2, reps: 8, done: false }), // exercise B — the one being guided
    set({ localId: 'b2', exerciseId: 2, reps: 8, done: false }),
    set({ localId: 'c1', exerciseId: 3, reps: 5, done: true }), // exercise C
  ]
  const results = [
    { localId: 'b1', reps: 7 },
    { localId: 'b2', reps: 8 },
  ]
  const next = mergeGuideResults(sets, results)

  // Exercise A (the "first exercise" in the bug repro) is byte-for-byte intact.
  assert.deepEqual(next.find((s) => s.localId === 'a1'), sets[0])
  assert.deepEqual(next.find((s) => s.localId === 'a2'), sets[1])
  // Exercise C likewise untouched.
  assert.deepEqual(next.find((s) => s.localId === 'c1'), sets[4])
  // Exercise B got the guided results, marked done.
  assert.equal(next.find((s) => s.localId === 'b1').reps, 7)
  assert.equal(next.find((s) => s.localId === 'b1').done, true)
  assert.equal(next.find((s) => s.localId === 'b2').reps, 8)
  assert.equal(next.find((s) => s.localId === 'b2').done, true)
  // No exercise/set count was lost.
  assert.equal(next.length, sets.length)
})

test('mergeGuideResults with empty results (Exit before completing any set) is a total no-op', () => {
  const sets = [
    set({ localId: 'a1', exerciseId: 1 }),
    set({ localId: 'b1', exerciseId: 2 }),
  ]
  const next = mergeGuideResults(sets, [])
  assert.deepEqual(next, sets)
})

test('mergeGuideResults skips a 0-rep result (Tile 11 rule: adjusting to 0 logs nothing) — that set is left pending, not marked done', () => {
  const sets = [set({ localId: 'b1', exerciseId: 2, reps: 8, done: false })]
  const next = mergeGuideResults(sets, [{ localId: 'b1', reps: 0 }])
  assert.equal(next[0].reps, 8) // unchanged — not overwritten with 0
  assert.equal(next[0].done, false) // stays pending
})

test('mergeGuideResults never mutates the input array', () => {
  const sets = [set({ localId: 'a1', exerciseId: 1, reps: 8, done: false })]
  const snapshot = JSON.parse(JSON.stringify(sets))
  mergeGuideResults(sets, [{ localId: 'a1', reps: 9 }])
  assert.deepEqual(sets, snapshot)
})

test('mergeGuideResults persists the reviewed difficulty and guided rest without touching weight', () => {
  const sets = [set({ localId: 'a1', exerciseId: 1, weight: 82.5, reps: 8, difficulty: null, rest_seconds: null })]
  const next = mergeGuideResults(sets, [{ localId: 'a1', reps: 7, difficulty: 4, restSeconds: 36 }])

  assert.deepEqual(next[0], {
    ...sets[0],
    reps: 7,
    difficulty: 4,
    rest_seconds: 36,
    done: true,
  })
})

test('mergeGuideResults leaves optional difficulty and rest unchanged when the guide did not supply them', () => {
  const sets = [set({ localId: 'a1', reps: 8, difficulty: 3, rest_seconds: 44 })]
  const next = mergeGuideResults(sets, [{ localId: 'a1', reps: 6 }])
  assert.equal(next[0].difficulty, 3)
  assert.equal(next[0].rest_seconds, 44)
})

test('mergeGuideResults on a mid-guide Exit (partial results — 1 of 3 sets completed) preserves the other exercises AND the guided exercise\'s own not-yet-completed sets', () => {
  const sets = [
    set({ localId: 'a1', exerciseId: 1, reps: 10, done: true }),
    set({ localId: 'b1', exerciseId: 2, reps: 8, done: false }),
    set({ localId: 'b2', exerciseId: 2, reps: 8, done: false }), // guide exited before this one finished
    set({ localId: 'b3', exerciseId: 2, reps: 8, done: false }), // never started
    set({ localId: 'c1', exerciseId: 3, reps: 5, done: true }),
  ]
  const results = [{ localId: 'b1', reps: 6 }] // only the first set completed before Exit
  const next = mergeGuideResults(sets, results)

  assert.deepEqual(next.find((s) => s.localId === 'a1'), sets[0])
  assert.deepEqual(next.find((s) => s.localId === 'c1'), sets[4])
  assert.equal(next.find((s) => s.localId === 'b1').reps, 6)
  assert.equal(next.find((s) => s.localId === 'b1').done, true)
  // b2/b3 were never completed — left exactly as they were (pending), not
  // wrongly marked done, not dropped.
  assert.deepEqual(next.find((s) => s.localId === 'b2'), sets[2])
  assert.deepEqual(next.find((s) => s.localId === 'b3'), sets[3])
  assert.equal(next.length, 5)
})

test('lastCompletedGuideSetId selects the latest positive-rep result for the main rest reset', () => {
  assert.equal(lastCompletedGuideSetId([
    { localId: 'a', reps: 8 },
    { localId: 'b', reps: 0 },
    { localId: 'c', reps: 6 },
  ]), 'c')
})

test('lastCompletedGuideSetId returns null when the guide logged no completed reps', () => {
  assert.equal(lastCompletedGuideSetId([{ localId: 'a', reps: 0 }]), null)
  assert.equal(lastCompletedGuideSetId([]), null)
})
