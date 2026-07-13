/**
 * Unit tests for D4 (rest-target-template): `resolveRestTarget` is the pure
 * resolve-order helper behind the sticky RestTimer's `initialTarget` and the
 * whole-exercise guide's `restSeconds` in WorkoutLogger.tsx. Priority order
 * (Tile 6): a PT prescription on `routine_exercises.rest_seconds` for the
 * exercise wins; otherwise the athlete's single global stepper value
 * (`wt.restTarget`) applies — there is NO per-exercise learned memory, so
 * nudging the global value must only ever affect exercises with no
 * prescription.
 * Run: node --import tsx --test .claude/test_rest-target.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { resolveRestTarget } = await import('../src/lib/restTimer.ts')

test('resolveRestTarget: PT prescription wins over the global value', () => {
  assert.equal(resolveRestTarget(180, 90), 180)
})

test('resolveRestTarget: falls back to the global value when there is no prescription (undefined)', () => {
  assert.equal(resolveRestTarget(undefined, 90), 90)
})

test('resolveRestTarget: falls back to the global value when there is no prescription (null)', () => {
  assert.equal(resolveRestTarget(null, 90), 90)
})

test('resolveRestTarget: a prescribed 0 is honored, not treated as absent', () => {
  assert.equal(resolveRestTarget(0, 90), 0)
})

test('resolveRestTarget: nudging the global value only changes the un-prescribed exercise', () => {
  // Exercise A prescribes 180s, B prescribes nothing.
  const ptRest = { A: 180 }
  let globalTarget = 90

  assert.equal(resolveRestTarget(ptRest.A, globalTarget), 180) // A
  assert.equal(resolveRestTarget(ptRest['B'], globalTarget), 90) // B

  globalTarget = 120 // athlete nudges the global stepper

  assert.equal(resolveRestTarget(ptRest.A, globalTarget), 180) // A unaffected
  assert.equal(resolveRestTarget(ptRest['B'], globalTarget), 120) // B follows
})
