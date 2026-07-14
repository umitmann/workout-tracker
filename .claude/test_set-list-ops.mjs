/**
 * Unit tests for setListOps — pure LocalSet[] operations extracted from
 * WorkoutLogger (WP-02). Scenario: workout-logger-core.
 * Run: node --import tsx --test .claude/test_set-list-ops.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  addSet,
  deleteSet,
  applyEdit,
  cancelEdit,
  reorderExercise,
  recordRestForSet,
  requestSetDelete,
  commitPending,
  resolveEditFields,
  applyWeightToExercise,
} = await import('../src/lib/setListOps.ts')

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

test('addSet appends within the exercise group (end of list, matching new set data)', () => {
  const sets = [set({ localId: 'a', exerciseId: 1 }), set({ localId: 'b', exerciseId: 2 })]
  const added = set({ localId: 'c', exerciseId: 1, weight: 50, reps: 5 })
  const next = addSet(sets, added)
  assert.equal(next.length, 3)
  assert.deepEqual(next[2], added)
  // original untouched
  assert.equal(sets.length, 2)
})

test('deleteSet removes only the target localId', () => {
  const sets = [set({ localId: 'a' }), set({ localId: 'b' }), set({ localId: 'c' })]
  const next = deleteSet(sets, 'b')
  assert.deepEqual(next.map((s) => s.localId), ['a', 'c'])
})

test('deleteSet no-ops when localId is not present', () => {
  const sets = [set({ localId: 'a' }), set({ localId: 'b' })]
  const next = deleteSet(sets, 'zzz')
  assert.deepEqual(next.map((s) => s.localId), ['a', 'b'])
})

test('applyEdit updates only the target set, leaving others untouched', () => {
  const sets = [set({ localId: 'a', weight: 10, reps: 5 }), set({ localId: 'b', weight: 20, reps: 8 })]
  const next = applyEdit(sets, 'a', { weight: 15, reps: 6 })
  assert.equal(next[0].weight, 15)
  assert.equal(next[0].reps, 6)
  assert.equal(next[1].weight, 20)
  assert.equal(next[1].reps, 8)
})

test('applyEdit accepts partial patches (only supplied fields change)', () => {
  const sets = [set({ localId: 'a', weight: 10, reps: 5, duration_minutes: 3, distance: 2 })]
  const next = applyEdit(sets, 'a', { weight: 99 })
  assert.equal(next[0].weight, 99)
  assert.equal(next[0].reps, 5)
  assert.equal(next[0].duration_minutes, 3)
  assert.equal(next[0].distance, 2)
})

test('applyWeightToExercise explicitly applies one weight to every set of that exercise', () => {
  const sets = [
    set({ localId: 'a1', exerciseId: 1, weight: 80, reps: 8, done: true }),
    set({ localId: 'a2', exerciseId: 1, weight: 70, reps: 10, done: false }),
    set({ localId: 'b1', exerciseId: 2, weight: 25, reps: 12, done: true }),
  ]
  const next = applyWeightToExercise(sets, 1, 82.5)

  assert.deepEqual(next.map((s) => s.weight), [82.5, 82.5, 25])
  assert.deepEqual(next.map((s) => s.reps), [8, 10, 12])
  assert.deepEqual(next.map((s) => s.done), [true, false, true])
})

test('applyWeightToExercise can clear weights and never mutates the source dropset', () => {
  const sets = [
    set({ localId: 'a1', exerciseId: 1, weight: 60 }),
    set({ localId: 'a2', exerciseId: 1, weight: 50 }),
  ]
  const snapshot = structuredClone(sets)
  const next = applyWeightToExercise(sets, 1, null)

  assert.deepEqual(next.map((s) => s.weight), [null, null])
  assert.deepEqual(sets, snapshot)
})

test('cancelEdit reverts the target set to its prior values', () => {
  const original = set({ localId: 'a', weight: 10, reps: 5 })
  const sets = [original, set({ localId: 'b', weight: 20 })]
  const edited = applyEdit(sets, 'a', { weight: 999, reps: 999 })
  const reverted = cancelEdit(edited, 'a', original)
  assert.equal(reverted[0].weight, 10)
  assert.equal(reverted[0].reps, 5)
  // untouched set unaffected
  assert.equal(reverted[1].weight, 20)
})

test('reorderExercise moves an exercise up, keeping each exercise contiguous block intact', () => {
  const sets = [
    set({ localId: 'a1', exerciseId: 1 }),
    set({ localId: 'a2', exerciseId: 1 }),
    set({ localId: 'b1', exerciseId: 2 }),
  ]
  const next = reorderExercise(sets, 2, 'up')
  assert.deepEqual(next.map((s) => s.localId), ['b1', 'a1', 'a2'])
})

test('reorderExercise moves an exercise down, keeping each exercise contiguous block intact', () => {
  const sets = [
    set({ localId: 'a1', exerciseId: 1 }),
    set({ localId: 'a2', exerciseId: 1 }),
    set({ localId: 'b1', exerciseId: 2 }),
  ]
  const next = reorderExercise(sets, 1, 'down')
  assert.deepEqual(next.map((s) => s.localId), ['b1', 'a1', 'a2'])
})

test('reorderExercise no-ops moving the first exercise up', () => {
  const sets = [set({ localId: 'a1', exerciseId: 1 }), set({ localId: 'b1', exerciseId: 2 })]
  const next = reorderExercise(sets, 1, 'up')
  assert.deepEqual(next.map((s) => s.localId), ['a1', 'b1'])
})

test('reorderExercise no-ops moving the last exercise down', () => {
  const sets = [set({ localId: 'a1', exerciseId: 1 }), set({ localId: 'b1', exerciseId: 2 })]
  const next = reorderExercise(sets, 2, 'down')
  assert.deepEqual(next.map((s) => s.localId), ['a1', 'b1'])
})

test('reorderExercise preserves internal set order within the moved block', () => {
  const sets = [
    set({ localId: 'a1', exerciseId: 1 }),
    set({ localId: 'a2', exerciseId: 1 }),
    set({ localId: 'a3', exerciseId: 1 }),
    set({ localId: 'b1', exerciseId: 2 }),
  ]
  const next = reorderExercise(sets, 2, 'up')
  assert.deepEqual(next.map((s) => s.localId), ['b1', 'a1', 'a2', 'a3'])
})

test('recordRestForSet attaches elapsed seconds to the preceding set (actual elapsed, not target)', () => {
  const sets = [set({ localId: 'a', rest_seconds: null }), set({ localId: 'b', rest_seconds: null })]
  const next = recordRestForSet(sets, 'a', 62)
  assert.equal(next[0].rest_seconds, 62)
  assert.equal(next[1].rest_seconds, null)
})

test('recordRestForSet no-ops when the target localId is absent', () => {
  const sets = [set({ localId: 'a', rest_seconds: null })]
  const next = recordRestForSet(sets, 'missing', 62)
  assert.equal(next[0].rest_seconds, null)
})

// ─── requestSetDelete (WP-09: two-tap confirm state transition) ────────────
// Mirrors the calendar's confirmDeleteId pattern (§3.15-3.17): first tap on a
// localId arms confirmation; a second tap on the *same* armed localId confirms
// (caller then performs the actual deleteSet); a tap on a *different* localId
// re-arms on the new target rather than confirming the old one.

test('requestSetDelete arms confirmation on first tap (nothing pending yet)', () => {
  const result = requestSetDelete(null, 'a')
  assert.deepEqual(result, { pendingId: 'a', confirmed: false })
})

test('requestSetDelete confirms on second tap of the same armed localId', () => {
  const result = requestSetDelete('a', 'a')
  assert.deepEqual(result, { pendingId: null, confirmed: true })
})

test('requestSetDelete re-arms on a different localId rather than confirming', () => {
  const result = requestSetDelete('a', 'b')
  assert.deepEqual(result, { pendingId: 'b', confirmed: false })
})

test('requestSetDelete.cancel clears pending unconditionally', () => {
  assert.equal(requestSetDelete.cancel(), null)
})

// ─── commitPending (Tile 9: add-set form auto-commit) ──────────────────────

const base = { localId: 'new', exerciseId: 1, exerciseName: 'Bench Press', exerciseCategory: 'strength' }

test('commitPending builds a NOT-DONE set from typed weight/reps', () => {
  const result = commitPending({ weight: '60', reps: '10', duration_minutes: '', distance: '' }, base, false)
  assert.ok(result)
  assert.equal(result.weight, 60)
  assert.equal(result.reps, 10)
  assert.equal(result.done, false)
  assert.equal(result.rest_seconds, null)
})

test('commitPending accepts a partial value (weight only)', () => {
  const result = commitPending({ weight: '60', reps: '', duration_minutes: '', distance: '' }, base, false)
  assert.ok(result)
  assert.equal(result.weight, 60)
  assert.equal(result.reps, null)
  assert.equal(result.done, false)
})

test('commitPending ignores re-seeded defaults until the user edits the add form', () => {
  const result = commitPending(
    { weight: '60', reps: '10', duration_minutes: '', distance: '' },
    base,
    false,
    false,
  )
  assert.equal(result, null)
})

test('commitPending returns null for a fully-empty non-cardio form (no phantom set)', () => {
  const result = commitPending({ weight: '', reps: '', duration_minutes: '', distance: '' }, base, false)
  assert.equal(result, null)
})

test('commitPending returns null for a fully-empty cardio form (no phantom set)', () => {
  const result = commitPending({ weight: '', reps: '', duration_minutes: '', distance: '' }, base, true)
  assert.equal(result, null)
})

test('commitPending builds a NOT-DONE cardio set from typed duration/distance', () => {
  const result = commitPending({ weight: '', reps: '', duration_minutes: '30', distance: '5' }, base, true)
  assert.ok(result)
  assert.equal(result.duration_minutes, 30)
  assert.equal(result.distance, 5)
  assert.equal(result.done, false)
})

test('commitPending ignores weight/reps typed while in cardio mode (category-consistent fields only)', () => {
  const result = commitPending({ weight: '60', reps: '10', duration_minutes: '', distance: '' }, base, true)
  // weight/reps alone don't count as cardio content, so this is empty
  assert.equal(result, null)
})

// ─── resolveEditFields (Tile 9b: saveEditSet empty-field fallback) ─────────

const prior = { weight: 60, reps: 10, duration_minutes: null, distance: null }

test('resolveEditFields uses the typed value when present', () => {
  const result = resolveEditFields({ weight: '65', reps: '8', duration_minutes: '', distance: '' }, prior, false)
  assert.equal(result.weight, 65)
  assert.equal(result.reps, 8)
})

test('resolveEditFields falls back to the PRIOR value (never null) when a field is emptied', () => {
  const result = resolveEditFields({ weight: '', reps: '8', duration_minutes: '', distance: '' }, prior, false)
  assert.equal(result.weight, 60) // NOT null — the prior value is kept
  assert.equal(result.reps, 8)
})

test('resolveEditFields falls back to prior for both fields when both are emptied', () => {
  const result = resolveEditFields({ weight: '', reps: '', duration_minutes: '', distance: '' }, prior, false)
  assert.equal(result.weight, 60)
  assert.equal(result.reps, 10)
})

test('resolveEditFields does not touch `done` — applying it preserves whatever done state the set already had', () => {
  const sets = [set({ localId: 'a', weight: 60, reps: 10, done: true })]
  const fields = resolveEditFields({ weight: '65', reps: '', duration_minutes: '', distance: '' }, sets[0], false)
  const next = applyEdit(sets, 'a', fields)
  assert.equal(next[0].weight, 65)
  assert.equal(next[0].reps, 10) // fallback, not nulled
  assert.equal(next[0].done, true) // untouched — stays done
})

test('resolveEditFields on a not-done set leaves it not-done after applying', () => {
  const sets = [set({ localId: 'a', weight: 60, reps: 10, done: false })]
  const fields = resolveEditFields({ weight: '65', reps: '12', duration_minutes: '', distance: '' }, sets[0], false)
  const next = applyEdit(sets, 'a', fields)
  assert.equal(next[0].done, false)
})

test('resolveEditFields cardio: falls back to prior duration/distance when cleared', () => {
  const cardioPrior = { weight: null, reps: null, duration_minutes: 30, distance: 5 }
  const result = resolveEditFields({ weight: '', reps: '', duration_minutes: '', distance: '' }, cardioPrior, true)
  assert.equal(result.duration_minutes, 30)
  assert.equal(result.distance, 5)
})
