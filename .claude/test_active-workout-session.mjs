import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const {
  ACTIVE_WORKOUT_SESSION_VERSION,
  buildActiveWorkoutSummary,
  isResumableWorkoutRecord,
  normalizeActiveWorkoutSession,
  elapsedRestSeconds,
  restClockSeconds,
  restOwnerForSet,
  findRestOwnerSet,
} = await import('../src/lib/activeWorkoutSession.ts')

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function set(overrides = {}) {
  return {
    localId: 'set-1',
    exerciseId: 7,
    exerciseName: 'Leg press',
    exerciseCategory: 'strength',
    weight: 60,
    reps: 14,
    duration_minutes: null,
    distance: null,
    done: false,
    ...overrides,
  }
}

test('a minimized fixed rest continues from absolute wall-clock time', () => {
  const rest = { startedAt: 1_000, initialElapsed: 12, mode: 'fixed', target: 90, ownerExerciseId: 7, ownerSetIndex: 1 }
  assert.equal(elapsedRestSeconds(rest, 11_000), 22)
  assert.equal(restClockSeconds(rest, 11_000), 68)
})

test('a minimized variable rest counts upward', () => {
  const rest = { startedAt: 1_000, initialElapsed: 12, mode: 'variable', target: 90, ownerExerciseId: 7, ownerSetIndex: 0 }
  assert.equal(restClockSeconds(rest, 11_000), 22)
})

test('corrupt or unbounded local session data is rejected', () => {
  assert.equal(normalizeActiveWorkoutSession(null), null)
  assert.equal(normalizeActiveWorkoutSession({ workoutId: -1, date: 'bad' }), null)
  // Version 1 had no resumability proof or useful mini-player summary. It is
  // deliberately rejected so old browser storage cannot claim a workout is
  // active immediately after login.
  assert.equal(normalizeActiveWorkoutSession({ workoutId: 4, date: '2026-07-31', updatedAt: 10, rest: null }), null)
})

test('the active workout summary follows the next unfinished set and keeps useful prescription context', () => {
  const summary = buildActiveWorkoutSummary([
    set({ done: true }),
    set({ localId: 'set-2', weight: 65, reps: 12 }),
    set({ localId: 'set-3', exerciseId: 8, exerciseName: 'Chest press', weight: 30, reps: 10 }),
  ])

  assert.deepEqual(summary, {
    exerciseName: 'Leg press',
    setNumber: 2,
    exerciseSetCount: 2,
    completedSets: 1,
    totalSets: 3,
    prescription: '65 kg × 12',
    allSetsComplete: false,
  })
  assert.equal(buildActiveWorkoutSummary([]), null)
})

test('a current version session requires a non-empty bounded workout summary', () => {
  const value = {
    version: ACTIVE_WORKOUT_SESSION_VERSION,
    workoutId: 4,
    date: '2026-07-31',
    updatedAt: 10,
    rest: null,
    summary: buildActiveWorkoutSummary([set()]),
  }
  assert.deepEqual(normalizeActiveWorkoutSession(value), value)
  assert.equal(normalizeActiveWorkoutSession({ ...value, summary: null }), null)
})

test('only an in-progress workout with persisted sets is resumable', () => {
  assert.equal(isResumableWorkoutRecord({ status: 'in_progress', setCount: 1 }), true)
  assert.equal(isResumableWorkoutRecord({ status: 'in_progress', setCount: 0 }), false)
  assert.equal(isResumableWorkoutRecord({ status: 'planned', setCount: 3 }), false)
  assert.equal(isResumableWorkoutRecord({ status: 'completed', setCount: 3 }), false)
  assert.equal(isResumableWorkoutRecord(null), false)
})

test('rest ownership survives replacement database ids through exercise ordinal', () => {
  const sets = [
    { localId: 'old-a', exerciseId: 7 },
    { localId: 'old-b', exerciseId: 7 },
    { localId: 'other', exerciseId: 8 },
  ]
  const owner = restOwnerForSet(sets, 'old-b')
  assert.deepEqual(owner, { ownerExerciseId: 7, ownerSetIndex: 1 })
  assert.equal(findRestOwnerSet([
    { localId: 'new-a', exerciseId: 7 },
    { localId: 'new-b', exerciseId: 7 },
  ], owner), 'new-b')
})

test('the floating workout frame validates resumability and exposes compact workout context', async () => {
  const [dock, action, logger, css] = await Promise.all([
    source('../src/components/ActiveWorkoutDock.tsx'),
    source('../src/app/actions/workouts.ts'),
    source('../src/app/workout/[id]/WorkoutLogger.tsx'),
    source('../src/app/globals.css'),
  ])

  assert.match(dock, /validateActiveWorkoutSession/)
  assert.match(dock, /Collapse minimized workout/)
  assert.match(dock, /Expand minimized workout/)
  assert.match(dock, /summary\.exerciseName/)
  assert.match(dock, /summary\.completedSets/)
  assert.match(dock, /Add 15 seconds to rest/)
  assert.match(dock, /Skip rest/)
  assert.match(dock, /<Link/)
  assert.doesNotMatch(dock, /<a\s/)
  assert.match(dock, /active-workout-frame/)
  assert.match(css, /@container active-workout-frame/)

  assert.match(action, /isResumableWorkoutRecord/)
  assert.match(logger, /buildActiveWorkoutSummary\(localSets\)/)
  assert.match(logger, /if \(!summary\)/)
})
