/**
 * Unit tests for numericInput — pure raw-string-preservation decisions
 * extracted from Stepper.tsx (WP-18, finding L3). The Stepper keeps the raw
 * typed string in state until blur so a partial decimal like "2." or "2.5"
 * never snaps to 0 mid-keystroke; only on blur (or a ▲/▼ bump) does it commit
 * to a clamped numeric value. No DOM/React — pure string/number decisions.
 * Run: node --import tsx --test .claude/test_numeric-input.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { isDraftableNumericInput, commitNumericDraft } = await import('../src/lib/numericInput.ts')

// ─── isDraftableNumericInput — what onChange allows into the raw draft ─────
// The point of this predicate: reject keystrokes that could never become part
// of a valid number, but allow in-progress ones ("", "2", "2.", "2.5", "-").

test('empty string is draftable (user cleared the field)', () => {
  assert.equal(isDraftableNumericInput(''), true)
})

test('a bare digit is draftable', () => {
  assert.equal(isDraftableNumericInput('2'), true)
})

test('a trailing decimal point is draftable ("2.") — the L3 bug case', () => {
  assert.equal(isDraftableNumericInput('2.'), true)
})

test('a completed decimal is draftable ("2.5")', () => {
  assert.equal(isDraftableNumericInput('2.5'), true)
})

test('a lone decimal point is draftable (".5" in progress)', () => {
  assert.equal(isDraftableNumericInput('.'), true)
})

test('letters are not draftable', () => {
  assert.equal(isDraftableNumericInput('2a'), false)
  assert.equal(isDraftableNumericInput('abc'), false)
})

test('a second decimal point is not draftable', () => {
  assert.equal(isDraftableNumericInput('2.5.6'), false)
})

test('whitespace-only is not draftable', () => {
  assert.equal(isDraftableNumericInput('  '), false)
})

// ─── commitNumericDraft — what happens on blur / ▲▼ bump ────────────────────
// Converts the raw draft into a clamped numeric value. Empty/invalid drafts
// commit to min (never silently become an arbitrary 0 if min > 0).

test('a well-formed draft commits to its numeric value', () => {
  assert.equal(commitNumericDraft('2.5', { min: 0, max: 500 }), 2.5)
})

test('an empty draft commits to min', () => {
  assert.equal(commitNumericDraft('', { min: 0, max: 500 }), 0)
})

test('a trailing-dot draft ("2.") commits to its numeric value, not 0', () => {
  // This is the exact L3 regression: Number("2.") is 2, but the old
  // `Number(e.target.value) || 0` coercion pattern is fine here — the bug was
  // committing on every keystroke, not the parse itself. Preserving the raw
  // string until blur means the intermediate "2." is never coerced at all.
  assert.equal(commitNumericDraft('2.', { min: 0, max: 500 }), 2)
})

test('a lone decimal point commits to min (nothing typed yet)', () => {
  assert.equal(commitNumericDraft('.', { min: 0, max: 500 }), 0)
})

test('commit clamps below min up to min', () => {
  assert.equal(commitNumericDraft('-5', { min: 0, max: 500 }), 0)
})

test('commit clamps above max down to max', () => {
  assert.equal(commitNumericDraft('9999', { min: 0, max: 500 }), 500)
})

test('commit rounds to 2 decimal places to avoid float drift', () => {
  assert.equal(commitNumericDraft('2.005', { min: 0, max: 500 }), 2.01)
})
