/**
 * RED tests for WP-05 (finding L7) — exportReport's grouping/ordering logic,
 * extracted to a pure core (`groupWorkoutSets`) and tested independently of
 * buildReport and the DAL/DB. Asserts: workouts stay in the order the DAL
 * handed them (DAL itself orders by date ascending, per dal.ts
 * getWorkoutsInRange — not re-sorted here), and exercises within a workout
 * are grouped in first-seen (insertion) order, not alphabetically or by id.
 * Run: node --import tsx --test .claude/test_report-grouping.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { groupWorkoutSets } = await import('../src/lib/buildReport.ts')

test('groupWorkoutSets: exercises within a workout are grouped in first-seen order, not alphabetical/id order', () => {
  const rows = [
    {
      id: 1,
      date: '2026-07-02',
      sets: [
        { exercise_id: 9, weight: 100, reps: 5, duration_minutes: null, distance: null, rest_seconds: null, exercises: { name: 'Zercher Squat', category: 'strength' } },
        { exercise_id: 2, weight: 40, reps: 12, duration_minutes: null, distance: null, rest_seconds: null, exercises: { name: 'Arm Curl', category: 'strength' } },
        { exercise_id: 9, weight: 105, reps: 4, duration_minutes: null, distance: null, rest_seconds: null, exercises: { name: 'Zercher Squat', category: 'strength' } },
      ],
    },
  ]
  const [workout] = groupWorkoutSets(rows)
  assert.deepEqual(workout.exercises.map((e) => e.name), ['Zercher Squat', 'Arm Curl'])
})

test('groupWorkoutSets: sets for the same exercise accumulate under one entry, in encounter order', () => {
  const rows = [
    {
      id: 1,
      date: '2026-07-02',
      sets: [
        { exercise_id: 1, weight: 100, reps: 5, duration_minutes: null, distance: null, rest_seconds: null, exercises: { name: 'Squat', category: 'strength' } },
        { exercise_id: 1, weight: 105, reps: 4, duration_minutes: null, distance: null, rest_seconds: null, exercises: { name: 'Squat', category: 'strength' } },
      ],
    },
  ]
  const [workout] = groupWorkoutSets(rows)
  assert.equal(workout.exercises.length, 1)
  assert.deepEqual(workout.exercises[0].sets.map((s) => s.weight), [100, 105])
})

test('groupWorkoutSets: workout order is preserved as handed in (DAL already sorts ascending by date)', () => {
  const rows = [
    { id: 1, date: '2026-07-02', sets: [] },
    { id: 2, date: '2026-07-05', sets: [] },
  ]
  const workouts = groupWorkoutSets(rows)
  assert.deepEqual(workouts.map((w) => w.date), ['2026-07-02', '2026-07-05'])
})

test('groupWorkoutSets: missing exercise name falls back to the exercise id, missing category to null', () => {
  const rows = [
    { id: 1, date: '2026-07-02', sets: [{ exercise_id: 77, weight: 10, reps: 3, duration_minutes: null, distance: null, rest_seconds: null, exercises: null }] },
  ]
  const [workout] = groupWorkoutSets(rows)
  assert.equal(workout.exercises[0].name, '77')
  assert.equal(workout.exercises[0].category, null)
})

test('groupWorkoutSets: workout with zero sets produces zero exercises, not a crash', () => {
  const rows = [{ id: 1, date: '2026-07-02', sets: [] }]
  const [workout] = groupWorkoutSets(rows)
  assert.deepEqual(workout.exercises, [])
})

test('groupWorkoutSets: empty input yields empty output', () => {
  assert.deepEqual(groupWorkoutSets([]), [])
})
