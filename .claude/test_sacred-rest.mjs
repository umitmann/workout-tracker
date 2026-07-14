/**
 * Unit tests for D5 (sacred rest): `canStartRestImplicitly` is the pure
 * decision helper behind `startRestFor` in WorkoutLogger.tsx — implicit
 * completion paths (toggleDone, handleAddSet, completeFromEdit) may only start
 * a rest when none is currently running. Explicit "Start rest" and guided
 * completion are deliberate boundaries: they preserve the old elapsed rest,
 * then restart, and therefore do not consult this helper.
 * Run: node --import tsx --test .claude/test_sacred-rest.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { canStartRestImplicitly } = await import('../src/lib/restTimer.ts')

test('canStartRestImplicitly allows starting when idle (no timer running)', () => {
  assert.equal(canStartRestImplicitly(null), true)
})

test('canStartRestImplicitly refuses when a timer is already running for some set', () => {
  assert.equal(canStartRestImplicitly('set-a'), false)
})

test('idle-gate is a pure function of restForSet only (no hidden state)', () => {
  // Calling it repeatedly with the same "running" input never flips to true —
  // an implicit caller can never sneak past a running timer no matter how
  // many times it asks.
  assert.equal(canStartRestImplicitly('set-a'), false)
  assert.equal(canStartRestImplicitly('set-a'), false)
  assert.equal(canStartRestImplicitly('set-a'), false)
})
