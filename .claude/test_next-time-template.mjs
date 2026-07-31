import { test } from 'node:test'
import assert from 'node:assert/strict'

const { mergeWorkoutSetsIntoTemplate } = await import('../src/lib/nextTimeTemplate.ts')

test('next-time update preserves template tempo/rest/order while replacing current set prescriptions', () => {
  const template = [{ exerciseId: 4, sets: 2, reps: 8, weight: 50, duration_minutes: null, distance: null, set_details: null, tempo: '3-1-2-1', rest_seconds: 90, order: 0 }]
  const current = [
    { exercise_id: 4, weight: 55, reps: 8, duration_minutes: null, distance: null },
    { exercise_id: 4, weight: 50, reps: 10, duration_minutes: null, distance: null },
  ]
  const next = mergeWorkoutSetsIntoTemplate(template, current)
  assert.equal(next[0].tempo, '3-1-2-1')
  assert.equal(next[0].rest_seconds, 90)
  assert.equal(next[0].order, 0)
  assert.deepEqual(next[0].set_details, [{ weight: 55, reps: 8 }, { weight: 50, reps: 10 }])
})

test('workout-only exercises append without deleting untouched template exercises', () => {
  const template = [
    { exerciseId: 1, sets: 1, reps: 5, weight: 100, duration_minutes: null, distance: null, set_details: null, tempo: null, rest_seconds: 120, order: 0 },
    { exerciseId: 2, sets: 1, reps: 10, weight: 20, duration_minutes: null, distance: null, set_details: null, tempo: null, rest_seconds: 60, order: 1 },
  ]
  const current = [
    { exercise_id: 1, weight: 105, reps: 5, duration_minutes: null, distance: null },
    { exercise_id: 3, weight: 40, reps: 12, duration_minutes: null, distance: null },
  ]
  const next = mergeWorkoutSetsIntoTemplate(template, current)
  assert.deepEqual(next.map((row) => row.exerciseId), [1, 2, 3])
  assert.equal(next[1].weight, 20)
  assert.equal(next[2].order, 2)
})
