/**
 * Unit tests for tempo — scenario: druh-tempo-timer
 * Run: node --experimental-strip-types --test .claude/test_tempo.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { parseTempo, formatTempo, repDuration, phaseAt, TEMPO_PHASES, TEMPO_PHASE_CUE, secondsLeft } = await import(
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

// ─── WP-15 (finding L5): pin previously-accidental edge-case behaviour ─────

test('parseTempo rejects a non-finite phase: "1-2-3-Infinity" -> null', () => {
  // Number('Infinity') is a finite-looking string coercion (Number.isFinite
  // rejects it), but this is pinned explicitly so a future refactor of the
  // numeric guard (e.g. switching to a regex or parseFloat) cannot silently
  // let Infinity/NaN-shaped strings back in.
  assert.equal(parseTempo('1-2-3-Infinity'), null)
})

test('parseTempo rejects a non-finite phase anywhere in the tuple, not just the last', () => {
  assert.equal(parseTempo('Infinity-2-3-4'), null)
  assert.equal(parseTempo('1-Infinity-3-4'), null)
  assert.equal(parseTempo('1-2-Infinity-4'), null)
  assert.equal(parseTempo('1-2-3-NaN'), null)
})

test('parseTempo rejects a leading dash: "-1-2-3-4" -> null', () => {
  // A leading "-" makes split('-') produce 5 parts (an empty string before
  // the first dash, e.g. ["", "1", "2", "3", "4"]), which already fails the
  // parts.length !== 4 structural check. Pinned here as a *behavioural*
  // contract (null), independent of which guard inside parseTempo happens to
  // catch it, so a future rewrite of the parser (e.g. switching to a regex)
  // can't accidentally start accepting a negative first phase.
  assert.equal(parseTempo('-1-2-3-4'), null)
})

test('parseTempo rejects any dash-delimited string containing an embedded negative sign, regardless of which guard catches it', () => {
  // By construction, split('-') breaks on every hyphen, so there is no way to
  // write a genuinely negative phase (e.g. "-2") inside this format without
  // also producing an extra empty part — "1--2-3-4" splits into
  // ["1", "", "2", "3", "4"], 5 parts, caught by the length guard rather than
  // the n < 0 guard. Pinned as a behavioural contract (always null) so this
  // stays true even if parseTempo's parsing strategy changes.
  assert.equal(parseTempo('1--2-3-4'), null)
  assert.equal(parseTempo('1-2--3-4'), null)
  assert.equal(parseTempo('1-2-3--4'), null)
})

test('parseTempo: fractional tempo "1.5-2-3-4" is ACCEPTED (deliberate decision, not an accident)', () => {
  // DECISION (WP-15, finding L5): fractional phase lengths are accepted.
  // Rationale: guidedTimer/DruhTimer drive the rep clock through phaseAt()
  // and repDuration() using plain floating-point arithmetic (`start + dur`,
  // `t < end`, `end - t`) — see src/lib/tempo.ts phaseAt(). There is no
  // integer assumption anywhere in that arithmetic, and secondsLeft() already
  // exists specifically to round a fractional "remaining" value for display
  // (Math.ceil(remaining - 1e-6)). A lifter typing "1.5-2-3-4" (a 1.5s
  // eccentric) gets a coherent, correctly-timed guided set. Tightening
  // parseTempo to reject fractional input would be a regression, not a fix.
  // If this decision is ever reversed (reject fractional), tighten the numeric
  // guard in parseTempo to `Number.isInteger(n)` and flip this assertion to
  // `null` — do not leave this test silently describing the old behaviour.
  assert.deepEqual(parseTempo('1.5-2-3-4'), { down: 1.5, rest: 2, up: 3, hold: 4 })
})

test('fractional tempo end-to-end: phaseAt and repDuration handle "1.5-2-3-4" arithmetic correctly', () => {
  // Supports the ACCEPT decision above with a concrete arithmetic check:
  // repDuration and phaseAt must not truncate or misbehave on the fractional
  // "down" phase.
  const cfg = parseTempo('1.5-2-3-4')
  assert.equal(repDuration(cfg), 10.5)
  // segments: down[0,1.5) rest[1.5,3.5) up[3.5,6.5) hold[6.5,10.5)
  assert.equal(phaseAt(cfg, 0).phase, 'down')
  assert.equal(phaseAt(cfg, 1.4).phase, 'down')
  assert.equal(phaseAt(cfg, 1.5).phase, 'rest')
  assert.ok(Math.abs(phaseAt(cfg, 1.5).remaining - 2) < 1e-9)
  assert.equal(phaseAt(cfg, 1.0).remaining, 0.5)
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

test('every phase has a plain-language action verb', () => {
  for (const p of TEMPO_PHASES) {
    assert.ok(TEMPO_PHASE_CUE[p].verb.length > 0)
  }
  assert.equal(TEMPO_PHASE_CUE.down.verb, 'LOWER')
  assert.equal(TEMPO_PHASE_CUE.up.verb, 'LIFT')
  // "let go" is intentionally avoided (implies dropping the weight)
  for (const p of TEMPO_PHASES) assert.notEqual(TEMPO_PHASE_CUE[p].verb.toLowerCase(), 'let go')
})

test('secondsLeft counts down in whole seconds, never fractional', () => {
  assert.equal(secondsLeft(3), 3)
  assert.equal(secondsLeft(2.9), 3)
  assert.equal(secondsLeft(2.1), 3)
  assert.equal(secondsLeft(2.0), 2)
  assert.equal(secondsLeft(0.4), 1)
  assert.equal(secondsLeft(0), 0)
})
