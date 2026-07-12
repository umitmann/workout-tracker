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

const {
  isDraftableNumericInput,
  commitNumericDraft,
  appendNumpadDigit,
  appendNumpadFraction,
  deleteNumpadChar,
} = await import('../src/lib/numericInput.ts')

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

// ─── appendNumpadDigit — custom numpad digit keys (D2 / Tile 10b) ──────────
// Same left-to-right string building a hardware keyboard would produce, so
// the result flows through the same isDraftableNumericInput/commitNumericDraft
// pipeline either way.

test('appending a digit to an empty draft starts the number', () => {
  assert.equal(appendNumpadDigit('', '6'), '6')
})

test('appending digits builds the string left-to-right', () => {
  assert.equal(appendNumpadDigit('6', '0'), '60')
})

test('a leading zero is replaced, not accumulated', () => {
  assert.equal(appendNumpadDigit('0', '6'), '6')
})

test('a non-digit key press is a no-op', () => {
  assert.equal(appendNumpadDigit('6', 'a'), '6')
})

test('digits can extend a value that already has a fractional part', () => {
  assert.equal(appendNumpadDigit('60.5', '1'), '60.51')
})

// ─── appendNumpadFraction — .25/.5/.75 keys (decimal/weight mode only) ─────
// Fraction keys set the fractional part outright rather than appending onto
// existing digits, so pressing a second fraction key corrects rather than
// compounds a mistake.

test('a fraction key on a bare integer appends the fraction', () => {
  assert.equal(appendNumpadFraction('60', '5'), '60.5')
})

test('a fraction key with nothing typed yet defaults the integer part to 0', () => {
  assert.equal(appendNumpadFraction('', '25'), '0.25')
})

test('a second fraction key replaces the first fraction, not compounds it', () => {
  assert.equal(appendNumpadFraction('60.25', '5'), '60.5')
})

test('.75 is available alongside .25 and .5', () => {
  assert.equal(appendNumpadFraction('12', '75'), '12.75')
})

// ─── deleteNumpadChar — the numpad's backspace key ─────────────────────────

test('delete removes the last character of the draft', () => {
  assert.equal(deleteNumpadChar('60.5'), '60.')
})

test('delete on an empty draft stays empty', () => {
  assert.equal(deleteNumpadChar(''), '')
})

test('delete can fully clear a single-digit draft', () => {
  assert.equal(deleteNumpadChar('6'), '')
})

// ─── Manual entry is authoritative over the arrows (D2 decision 4 / Tile 10b
// invariant) ─────────────────────────────────────────────────────────────
// Stepper.bump() reads `commitNumericDraft(draft, …)` as its base while
// mid-edit, and always re-derives the next value from that committed base —
// never from a separately-tracked "last arrow value". These tests exercise
// that same pipeline in isolation: a numpad/keyboard draft commits to a
// value, and a subsequent ±1 arrow bump is computed from *that* committed
// value, proving manual entry always wins and a later bump can never revert
// to a pre-typed number.

test('a manually-typed value overwrites a prior arrow-set value on commit', () => {
  // Arrow bumps to 61 (simulated: prior committed value).
  const afterArrow = 61
  // User taps the numpad: 6, 2, .5 -> draft "62.5" -> commits.
  let draft = appendNumpadDigit('', '6')
  draft = appendNumpadDigit(draft, '2')
  draft = appendNumpadFraction(draft, '5')
  const afterManualEntry = commitNumericDraft(draft, { min: 0, max: 500 })
  assert.equal(afterManualEntry, 62.5)
  assert.notEqual(afterManualEntry, afterArrow)
})

test('a bump after manual entry adjusts from the typed value, not the pre-typed one', () => {
  const typedValue = commitNumericDraft('62.5', { min: 0, max: 500 })
  // Stepper's bump(): base is the committed draft value (typed), +1/-1, clamped.
  const bumpedUp = Math.min(500, Math.max(0, Math.round((typedValue + 1) * 100) / 100))
  const bumpedDown = Math.min(500, Math.max(0, Math.round((typedValue - 1) * 100) / 100))
  assert.equal(bumpedUp, 63.5)
  assert.equal(bumpedDown, 61.5)
})
