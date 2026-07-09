/**
 * Unit tests for dal.ts pure cores — scenario: dal-core-extraction (WP-03)
 * Run: node --experimental-strip-types --test .claude/test_dal-cores.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { selectBestSession, aggregateHistory, buildPreviews } = await import(
  '../src/lib/dalCores.ts'
)

// ─── selectBestSession (checklist §7.5, §7.8) ───────────────────────────────

test('selectBestSession picks the workout containing the highest-weight set', () => {
  const workouts = [
    { id: 1, date: '2026-06-01' },
    { id: 2, date: '2026-06-15' },
  ]
  const sets = [
    { workout_id: 1, weight: 100, reps: 5 },
    { workout_id: 2, weight: 50, reps: 10 },
    { workout_id: 2, weight: null, reps: 12 },
  ]
  const result = selectBestSession(sets, workouts)
  assert.equal(result.date, '2026-06-01')
  assert.deepEqual(result.sets, [{ weight: 100, reps: 5 }])
})

test('selectBestSession falls back to the most recent workout when all weights are null (reps-only/bodyweight)', () => {
  const workouts = [
    { id: 1, date: '2026-06-01' },
    { id: 2, date: '2026-06-15' },
  ]
  const sets = [
    { workout_id: 1, weight: null, reps: 8 },
    { workout_id: 2, weight: null, reps: 12 },
  ]
  const result = selectBestSession(sets, workouts)
  // workouts is assumed ordered most-recent-first by the caller, per dal.ts convention
  assert.equal(result.date, '2026-06-01')
  assert.deepEqual(result.sets, [{ weight: null, reps: 8 }])
})

test('selectBestSession returns null for an empty set list', () => {
  assert.equal(selectBestSession([], []), null)
  assert.equal(selectBestSession([], [{ id: 1, date: '2026-06-01' }]), null)
})

test('selectBestSession (60-day-window variant): caller passes only in-window workouts — empty window means null even though all-time data exists', () => {
  // Simulates §7.8: the DAL filters workouts to the 60-day window *before* calling
  // the core, so an empty window naturally yields no result at this layer too.
  const allTimeSets = [{ workout_id: 99, weight: 120, reps: 3 }]
  const inWindowWorkouts = [] // the 60-day query returned nothing
  const result = selectBestSession(allTimeSets, inWindowWorkouts)
  assert.equal(result, null)
})

test('selectBestSession only returns sets belonging to the chosen workout', () => {
  const workouts = [
    { id: 1, date: '2026-06-01' },
    { id: 2, date: '2026-06-15' },
  ]
  const sets = [
    { workout_id: 1, weight: 100, reps: 5 },
    { workout_id: 1, weight: 90, reps: 8 },
    { workout_id: 2, weight: 110, reps: 3 },
  ]
  const result = selectBestSession(sets, workouts)
  assert.equal(result.date, '2026-06-15')
  assert.deepEqual(result.sets, [{ weight: 110, reps: 3 }])
})

// ─── aggregateHistory (drives §5.8 weight-only chart) ───────────────────────

test('aggregateHistory reduces same-date sets to max weight, max reps, and total volume', () => {
  const points = aggregateHistory([
    { date: '2026-06-01', weight: 60, reps: 10 },
    { date: '2026-06-01', weight: 65, reps: 8 },
  ])
  assert.equal(points.length, 1)
  assert.deepEqual(points[0], {
    date: '2026-06-01',
    maxWeight: 65,
    maxReps: 10,
    totalVolume: 1120, // 60*10 + 65*8
    setCount: 2,
  })
})

test('aggregateHistory: reps-only sets (no weight) yield maxWeight null and no volume', () => {
  const points = aggregateHistory([
    { date: '2026-06-01', weight: null, reps: 12 },
    { date: '2026-06-01', weight: null, reps: 15 },
  ])
  assert.equal(points[0].maxWeight, null)
  assert.equal(points[0].maxReps, 15)
  assert.equal(points[0].totalVolume, null)
})

test('aggregateHistory sorts distinct dates ascending', () => {
  const points = aggregateHistory([
    { date: '2026-06-15', weight: 10, reps: 1 },
    { date: '2026-06-01', weight: 20, reps: 2 },
  ])
  assert.deepEqual(points.map((p) => p.date), ['2026-06-01', '2026-06-15'])
})

test('aggregateHistory on an empty list returns an empty array', () => {
  assert.deepEqual(aggregateHistory([]), [])
})

// ─── buildPreviews (checklist §10.6) ─────────────────────────────────────────

test('buildPreviews gives planned workouts no preview at all', () => {
  const workouts = [{ id: 1, date: '2026-06-01', status: 'planned' }]
  const setsByWorkout = new Map([[1, [{ exercise_id: 1, exercise_name: 'Squat', weight: 100, reps: 5 }]]])
  const previews = buildPreviews(workouts, setsByWorkout)
  assert.equal(previews[1], undefined)
})

test('buildPreviews groups completed-workout sets per exercise with a set count', () => {
  const workouts = [{ id: 1, date: '2026-06-01', status: 'completed' }]
  const setsByWorkout = new Map([
    [
      1,
      [
        { exercise_id: 1, exercise_name: 'Squat', weight: 100, reps: 5 },
        { exercise_id: 1, exercise_name: 'Squat', weight: 105, reps: 3 },
        { exercise_id: 2, exercise_name: 'Bench Press', weight: 60, reps: 8 },
      ],
    ],
  ])
  const previews = buildPreviews(workouts, setsByWorkout)
  assert.deepEqual(previews[1], [
    { exerciseId: 1, exerciseName: 'Squat', setCount: 2, firstSetWeight: 100, firstSetReps: 5 },
    { exerciseId: 2, exerciseName: 'Bench Press', setCount: 1, firstSetWeight: 60, firstSetReps: 8 },
  ])
})

test('buildPreviews groups in-progress-workout sets the same way as completed', () => {
  const workouts = [{ id: 2, date: '2026-06-02', status: 'in_progress' }]
  const setsByWorkout = new Map([[2, [{ exercise_id: 5, exercise_name: 'Row', weight: 40, reps: 12 }]]])
  const previews = buildPreviews(workouts, setsByWorkout)
  assert.deepEqual(previews[2], [
    { exerciseId: 5, exerciseName: 'Row', setCount: 1, firstSetWeight: 40, firstSetReps: 12 },
  ])
})

test('buildPreviews omits a workout with zero sets (no key at all)', () => {
  const workouts = [{ id: 3, date: '2026-06-03', status: 'completed' }]
  const setsByWorkout = new Map()
  const previews = buildPreviews(workouts, setsByWorkout)
  assert.equal(previews[3], undefined)
})

test('buildPreviews preserves first-seen exercise order (insertion order, not sorted)', () => {
  const workouts = [{ id: 4, date: '2026-06-04', status: 'completed' }]
  const setsByWorkout = new Map([
    [
      4,
      [
        { exercise_id: 9, exercise_name: 'Zebra Curl', weight: 10, reps: 10 },
        { exercise_id: 2, exercise_name: 'Ab Wheel', weight: null, reps: 15 },
      ],
    ],
  ])
  const previews = buildPreviews(workouts, setsByWorkout)
  assert.deepEqual(previews[4].map((p) => p.exerciseName), ['Zebra Curl', 'Ab Wheel'])
})
