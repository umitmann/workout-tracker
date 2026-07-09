/**
 * Unit tests for modalFocus — pure key-handling/focus-cycling decisions
 * extracted from the shared Modal primitive (WP-08, ADR-0008). No DOM: the
 * Modal component supplies the focusable-node count/positions and this module
 * decides what to do. Scenario: modal-a11y-core.
 * Run: node --import tsx --test .claude/test_modal-focus.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { isEscapeKey, computeTabTarget, shouldCloseOnBackdropClick, resolveOpenFocusIndex } =
  await import('../src/lib/modalFocus.ts')

// ─── isEscapeKey ─────────────────────────────────────────────────────────────

test('isEscapeKey recognizes the Escape key', () => {
  assert.equal(isEscapeKey('Escape'), true)
})

test('isEscapeKey rejects other keys', () => {
  assert.equal(isEscapeKey('Enter'), false)
  assert.equal(isEscapeKey('Tab'), false)
  assert.equal(isEscapeKey('a'), false)
})

// ─── computeTabTarget — focus trap cycling ──────────────────────────────────
// Pure decision: given how many focusable elements are inside the dialog and
// which index currently holds focus, where should Tab/Shift+Tab send focus?
// Wraps at both ends so focus can never escape to the page behind the dialog.

test('Tab from the last focusable wraps to the first', () => {
  assert.equal(computeTabTarget({ count: 3, currentIndex: 2, shiftKey: false }), 0)
})

test('Tab from a middle element advances by one', () => {
  assert.equal(computeTabTarget({ count: 3, currentIndex: 0, shiftKey: false }), 1)
})

test('Shift+Tab from the first focusable wraps to the last', () => {
  assert.equal(computeTabTarget({ count: 3, currentIndex: 0, shiftKey: true }), 2)
})

test('Shift+Tab from a middle element retreats by one', () => {
  assert.equal(computeTabTarget({ count: 3, currentIndex: 2, shiftKey: true }), 1)
})

test('with a single focusable element, Tab and Shift+Tab both hold it in place (loop of one)', () => {
  assert.equal(computeTabTarget({ count: 1, currentIndex: 0, shiftKey: false }), 0)
  assert.equal(computeTabTarget({ count: 1, currentIndex: 0, shiftKey: true }), 0)
})

test('currentIndex of -1 (focus outside the trap, e.g. not yet settled) is treated as before the first element', () => {
  // Tab should land on the first element, Shift+Tab should land on the last.
  assert.equal(computeTabTarget({ count: 3, currentIndex: -1, shiftKey: false }), 0)
  assert.equal(computeTabTarget({ count: 3, currentIndex: -1, shiftKey: true }), 2)
})

test('count of 0 (no focusable content) has no valid target', () => {
  assert.equal(computeTabTarget({ count: 0, currentIndex: -1, shiftKey: false }), null)
})

// ─── shouldCloseOnBackdropClick — ADR-0008 destructive-confirm exception ────

test('backdrop click closes a plain dialog', () => {
  assert.equal(shouldCloseOnBackdropClick({ destructive: false }), true)
})

test('backdrop click does NOT close a destructive-confirm dialog — explicit button only', () => {
  assert.equal(shouldCloseOnBackdropClick({ destructive: true }), false)
})

// ─── resolveOpenFocusIndex — where focus goes when the dialog opens ─────────

test('with focusable content and no explicit initial target, focus goes to the first focusable element', () => {
  assert.equal(resolveOpenFocusIndex({ count: 3, initialIndex: null }), 0)
})

test('an explicit initial index (e.g. a search input) is honored if in range', () => {
  assert.equal(resolveOpenFocusIndex({ count: 3, initialIndex: 1 }), 1)
})

test('an out-of-range explicit initial index falls back to the first element', () => {
  assert.equal(resolveOpenFocusIndex({ count: 3, initialIndex: 5 }), 0)
})

test('with no focusable content at all, there is nowhere to send focus', () => {
  assert.equal(resolveOpenFocusIndex({ count: 0, initialIndex: null }), null)
})
