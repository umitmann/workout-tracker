/**
 * Unit tests for deriveInitialSets — the workout+template → initial LocalSet[]
 * matrix that enforces behaviour-checklist §2 (completed never falls back to
 * template). WP-02, finding H4. Scenario: workout-logger-core.
 * Run: node --import tsx --test .claude/test_derive-initial-sets.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { deriveInitialSets } = await import('../src/lib/deriveInitialSets.ts')

function dbSet(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    exercise_id: overrides.exercise_id ?? 10,
    weight: overrides.weight ?? null,
    reps: overrides.reps ?? null,
    duration_minutes: overrides.duration_minutes ?? null,
    distance: overrides.distance ?? null,
    rest_seconds: overrides.rest_seconds ?? null,
    exercises: overrides.exercises ?? { name: 'Squat', category: null },
  }
}

function template(routineExercises = []) {
  return { id: 'r1', name: 'Leg day', created_at: '2026-01-01', routine_exercises: routineExercises }
}

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

test('§2.5: completed workout with empty sets table never falls back to template', () => {
  const rows = deriveInitialSets({ status: 'completed', sets: [] }, template([routineExercise()]))
  assert.deepEqual(rows, [])
})

test('§2.4/§2.6: completed workout always loads from sets, ignoring template entirely', () => {
  const rows = deriveInitialSets(
    { status: 'completed', sets: [dbSet({ id: 1, weight: 100, reps: 5 })] },
    template([routineExercise({ weight: 999, reps: 999 })]),
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].weight, 100)
  assert.equal(rows[0].reps, 5)
})

test('§2.2: in-progress workout with no saved sets loads the expanded template', () => {
  const rows = deriveInitialSets(
    { status: 'in_progress', sets: [] },
    template([routineExercise({ exercise_id: 10, sets: 2, weight: 40, reps: 10 })]),
  )
  assert.equal(rows.length, 2)
  assert.equal(rows[0].weight, 40)
  assert.equal(rows[0].done, false)
})

test('§2.3/§2.8: in-progress workout with saved sets loads from sets; template ignored even if newer', () => {
  const rows = deriveInitialSets(
    { status: 'in_progress', sets: [dbSet({ id: 1, weight: 60, reps: 8 })] },
    template([routineExercise({ weight: 999, reps: 999 })]),
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].weight, 60)
  assert.equal(rows[0].reps, 8)
  assert.equal(rows[0].done, true)
})

test('§2.1: fresh workout, no template, no sets → empty logger', () => {
  assert.deepEqual(deriveInitialSets({ status: 'in_progress', sets: [] }, null), [])
})

test('in-progress workout with no sets and no template → empty logger', () => {
  assert.deepEqual(deriveInitialSets({ status: 'in_progress', sets: [] }, null), [])
})

test('saved sets carry rest_seconds and mark done:true, falling back exercise name to id when relation missing', () => {
  const s = dbSet({ exercise_id: 99, rest_seconds: 45 })
  s.exercises = null
  const rows = deriveInitialSets({ status: 'in_progress', sets: [s] }, null)
  assert.equal(rows[0].exerciseName, '99')
  assert.equal(rows[0].rest_seconds, 45)
  assert.equal(rows[0].done, true)
})
