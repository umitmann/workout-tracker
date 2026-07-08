/**
 * Unit tests for tempo — scenario: druh-tempo-timer
 * Run: node --experimental-strip-types --test .claude/test_tempo.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { parseTempo, formatTempo, repDuration, phaseAt, TEMPO_PHASES } = await import(
  '../src/lib/tempo.ts'
)

test('parseTempo parses down-rest-up-hold', () => {
  assert.deepEqual(parseTempo('3-1-2-1'), { down: 3, rest: 1, up: 2, hold: 1 })
})

test('parseTempo tolerates spaces and returns null on garbage', () => {
  assert.deepEqual(parseTempo(' 4 - 0 - 2 - 0 '), { down: 4, rest: 0, up: 2, hold: 0 })
  assert.equal(parseTempo('3-1-2'), null)
  assert.equal(parseTempo('a-b-c-d'), null)
  assert.equal(parseTempo(''), null)
})

test('formatTempo round-trips', () => {
  const cfg = { down: 3, rest: 1, up: 2, hold: 1 }
  assert.equal(formatTempo(cfg), '3-1-2-1')
  assert.deepEqual(parseTempo(formatTempo(cfg)), cfg)
})

test('repDuration sums all phases', () => {
  assert.equal(repDuration({ down: 3, rest: 1, up: 2, hold: 1 }), 7)
  assert.equal(repDuration({ down: 4, rest: 0, up: 2, hold: 0 }), 6)
})

test('phaseAt returns the active phase and remaining time', () => {
  const cfg = { down: 3, rest: 1, up: 2, hold: 1 } // segments: down[0,3) rest[3,4) up[4,6) hold[6,7)
  assert.equal(phaseAt(cfg, 0).phase, 'down')
  assert.equal(phaseAt(cfg, 0).remaining, 3)
  assert.equal(phaseAt(cfg, 2.5).phase, 'down')
  assert.equal(phaseAt(cfg, 3).phase, 'rest')
  assert.equal(phaseAt(cfg, 3.5).phase, 'rest')
  assert.equal(phaseAt(cfg, 4).phase, 'up')
  assert.equal(phaseAt(cfg, 5).phase, 'up')
  assert.equal(phaseAt(cfg, 6).phase, 'hold')
  assert.equal(phaseAt(cfg, 6.5).remaining, 0.5)
})

test('phaseAt skips zero-length phases', () => {
  const cfg = { down: 4, rest: 0, up: 2, hold: 0 } // down[0,4) up[4,6)
  assert.equal(phaseAt(cfg, 0).phase, 'down')
  assert.equal(phaseAt(cfg, 4).phase, 'up')
  assert.equal(phaseAt(cfg, 5.5).phase, 'up')
})

test('phaseAt clamps out-of-range elapsed into the rep', () => {
  const cfg = { down: 3, rest: 1, up: 2, hold: 1 }
  // at exactly repDuration or beyond, caller should mod; but guard anyway
  const p = phaseAt(cfg, 7)
  assert.ok(TEMPO_PHASES.includes(p.phase))
})

test('TEMPO_PHASES is the canonical order', () => {
  assert.deepEqual(TEMPO_PHASES, ['down', 'rest', 'up', 'hold'])
})
