import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  normalizeActiveWorkoutSession,
  elapsedRestSeconds,
  restClockSeconds,
  restOwnerForSet,
  findRestOwnerSet,
} = await import('../src/lib/activeWorkoutSession.ts')

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
  assert.equal(normalizeActiveWorkoutSession({ workoutId: 4, date: '2026-07-31', updatedAt: 10, rest: { startedAt: NaN } })?.rest, null)
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
