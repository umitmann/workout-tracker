/**
 * Unit tests for guidedTimer + restTimer view-models — captures the DRUH guided
 * set + rest UX contracts. Run:
 *   node --experimental-strip-types --test .claude/test_guided-timer.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { guidedStateAt, completedRepsAt, stopEarlyReps, isTickSecond } = await import('../src/lib/guidedTimer.ts')
const { restViewAt, formatClock, startsRestOnComplete } = await import('../src/lib/restTimer.ts')

const T = { down: 3, rest: 1, up: 2, hold: 1 } // repDuration = 7

// ─── Guided timer ────────────────────────────────────────────────────────────

test('at t=0 the first rep shows LOWER with a 3s whole-second countdown', () => {
  const s = guidedStateAt(T, 10, 0)
  assert.equal(s.rep, 1)
  assert.equal(s.phase, 'down')
  assert.equal(s.verb, 'LOWER')
  assert.equal(s.secondsLeft, 3)
  assert.equal(s.finished, false)
})

test('countdown is whole seconds, never fractional', () => {
  assert.equal(guidedStateAt(T, 10, 0.4).secondsLeft, 3) // 2.6 remaining -> 3
  assert.equal(guidedStateAt(T, 10, 1.0).secondsLeft, 2) // 2.0 remaining -> 2
  assert.equal(guidedStateAt(T, 10, 2.5).secondsLeft, 1) // 0.5 remaining -> 1
})

test('phase verbs progress LOWER -> HOLD -> LIFT -> HOLD within one rep', () => {
  assert.equal(guidedStateAt(T, 10, 0).verb, 'LOWER') // down [0,3)
  assert.equal(guidedStateAt(T, 10, 3).verb, 'HOLD') // rest [3,4)
  assert.equal(guidedStateAt(T, 10, 4).verb, 'LIFT') // up [4,6)
  assert.equal(guidedStateAt(T, 10, 6).verb, 'HOLD') // hold [6,7)
})

test('each phase carries a directional symbol (down ↓, up ↑, holds ⏸)', () => {
  assert.equal(guidedStateAt(T, 10, 0).icon, '↓') // LOWER
  assert.equal(guidedStateAt(T, 10, 3).icon, '⏸') // HOLD bottom
  assert.equal(guidedStateAt(T, 10, 4).icon, '↑') // LIFT
  assert.equal(guidedStateAt(T, 10, 6).icon, '⏸') // HOLD top
})

test('rep number advances each repDuration', () => {
  assert.equal(guidedStateAt(T, 10, 0).rep, 1)
  assert.equal(guidedStateAt(T, 10, 7).rep, 2)
  assert.equal(guidedStateAt(T, 10, 14).rep, 3)
})

test('reaching the goal marks finished and caps completedReps at goal', () => {
  const s = guidedStateAt(T, 3, 21) // 3 reps * 7s
  assert.equal(s.finished, true)
  assert.equal(s.completedReps, 3)
  assert.equal(s.rep, 3)
})

test('degenerate zero-length tempo is finished immediately (never logs phantom reps mid-run)', () => {
  const s = guidedStateAt({ down: 0, rest: 0, up: 0, hold: 0 }, 8, 5)
  assert.equal(s.finished, true)
  assert.equal(s.completedReps, 0)
})

test('stopEarlyReps logs only fully completed reps, capped at goal', () => {
  assert.equal(stopEarlyReps(T, 10, 0), 0) // stopped during rep 1
  assert.equal(stopEarlyReps(T, 10, 6.9), 0) // rep 1 not finished
  assert.equal(stopEarlyReps(T, 10, 7), 1) // exactly one rep done
  assert.equal(stopEarlyReps(T, 10, 20), 2) // 2 full reps
  assert.equal(stopEarlyReps(T, 3, 999), 3) // never exceeds goal
})

test('completedRepsAt is safe for zero-length tempo', () => {
  assert.equal(completedRepsAt({ down: 0, rest: 0, up: 0, hold: 0 }, 100), 0)
})

test('tick fires only on the final 3 whole seconds', () => {
  assert.equal(isTickSecond(3), true)
  assert.equal(isTickSecond(1), true)
  assert.equal(isTickSecond(4), false)
  assert.equal(isTickSecond(0), false)
})

// ─── Rest timer ──────────────────────────────────────────────────────────────

test('formatClock renders mm:ss', () => {
  assert.equal(formatClock(0), '0:00')
  assert.equal(formatClock(9), '0:09')
  assert.equal(formatClock(90), '1:30')
  assert.equal(formatClock(125), '2:05')
})

test('fixed rest counts down and flags alarm + overtime at/after target', () => {
  assert.deepEqual(restViewAt('fixed', 90, 0), { display: '1:30', overtime: false, alarmDue: false })
  assert.equal(restViewAt('fixed', 90, 89).alarmDue, false)
  assert.equal(restViewAt('fixed', 90, 90).alarmDue, true)
  const over = restViewAt('fixed', 90, 95)
  assert.equal(over.overtime, true)
  assert.equal(over.display, '0:05') // 5s over
})

test('variable rest counts up and never alarms/overtimes', () => {
  const v = restViewAt('variable', 90, 45)
  assert.equal(v.display, '0:45')
  assert.equal(v.overtime, false)
  assert.equal(v.alarmDue, false)
})

test('completing a strength set starts rest; cardio does not', () => {
  assert.equal(startsRestOnComplete('strength'), true)
  assert.equal(startsRestOnComplete(null), true)
  assert.equal(startsRestOnComplete('cardio'), false)
})
