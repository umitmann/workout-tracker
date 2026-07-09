/**
 * Unit tests for expandTemplate — the single template/clipboard → set-rows
 * expansion, deduplicating the two copies formerly in WorkoutLogger (WP-02,
 * finding H4/M9). Scenario: workout-logger-core.
 * Run: node --import tsx --test .claude/test_expand-template.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { expandTemplate } = await import('../src/lib/expandTemplate.ts')

function routineExercise(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    exercise_id: overrides.exercise_id ?? 10,
    sets: overrides.sets ?? 1,
    reps: overrides.reps ?? null,
    weight: overrides.weight ?? null,
    duration_minutes: overrides.duration_minutes ?? null,
    distance: overrides.distance ?? null,
    set_details: overrides.set_details ?? null,
    tempo: overrides.tempo ?? null,
    order: overrides.order ?? 0,
    exercises: overrides.exercises ?? { id: overrides.exercise_id ?? 10, name: 'Squat', category: null },
  }
}

test('expandTemplate: set_details drives per-set weight/reps, in order', () => {
  const ex = routineExercise({
    exercise_id: 10,
    set_details: [
      { weight: 10, reps: 8 },
      { weight: 9, reps: 12 },
    ],
  })
  const rows = expandTemplate([ex])
  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map((r) => [r.weight, r.reps]),
    [[10, 8], [9, 12]],
  )
})

test('expandTemplate: no set_details falls back to `sets` uniform rows', () => {
  const ex = routineExercise({ exercise_id: 10, set_details: null, sets: 3, weight: 40, reps: 10 })
  const rows = expandTemplate([ex])
  assert.equal(rows.length, 3)
  for (const r of rows) {
    assert.equal(r.weight, 40)
    assert.equal(r.reps, 10)
  }
})

test('expandTemplate: cardio exercise carries duration/distance with null weight/reps', () => {
  const ex = routineExercise({
    exercise_id: 20,
    exercises: { id: 20, name: 'Run', category: 'cardio' },
    duration_minutes: 30,
    distance: 5,
    sets: 1,
    weight: null,
    reps: null,
  })
  const rows = expandTemplate([ex])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].weight, null)
  assert.equal(rows[0].reps, null)
  assert.equal(rows[0].duration_minutes, 30)
  assert.equal(rows[0].distance, 5)
  assert.equal(rows[0].exerciseCategory, 'cardio')
})

test('expandTemplate: exercises are expanded in `order`, not array position', () => {
  const first = routineExercise({ exercise_id: 1, order: 2, exercises: { id: 1, name: 'B', category: null } })
  const second = routineExercise({ exercise_id: 2, order: 1, exercises: { id: 2, name: 'A', category: null } })
  const rows = expandTemplate([first, second])
  assert.deepEqual(rows.map((r) => r.exerciseName), ['A', 'B'])
})

test('expandTemplate: falls back to exercise_id as name when exercises relation is missing', () => {
  const ex = routineExercise({ exercise_id: 42 })
  ex.exercises = null
  const rows = expandTemplate([ex])
  assert.equal(rows[0].exerciseName, '42')
  assert.equal(rows[0].exerciseCategory, null)
})

test('expandTemplate: every row starts undone with no rest recorded yet', () => {
  const ex = routineExercise({ exercise_id: 10, sets: 2 })
  const rows = expandTemplate([ex])
  for (const r of rows) {
    assert.equal(r.done, false)
    assert.equal(r.rest_seconds, null)
    assert.equal(typeof r.localId, 'string')
    assert.ok(r.localId.length > 0)
  }
})

test('expandTemplate: sets defaults to 1 row when `sets` is falsy/zero', () => {
  const ex = routineExercise({ exercise_id: 10, sets: 0, set_details: null, weight: 5, reps: 5 })
  const rows = expandTemplate([ex])
  assert.equal(rows.length, 1)
})

test('expandTemplate: empty routine_exercises list yields no rows', () => {
  assert.deepEqual(expandTemplate([]), [])
})
