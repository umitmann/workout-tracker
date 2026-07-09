/**
 * Unit tests for formatRestRow — pure row-format helper for displaying a
 * set's rest duration (WP-10, checklist §17.8/§17.9, finding M3).
 * Reuses formatClock from restTimer. Run: node --import tsx --test .claude/test_rest-row-format.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { formatRestRow } = await import('../src/lib/restTimer.ts')

test('formatRestRow renders mm:ss for a positive rest_seconds', () => {
  assert.equal(formatRestRow(74), 'Rest 1:14')
})

test('formatRestRow renders mm:ss for a sub-minute rest_seconds', () => {
  assert.equal(formatRestRow(45), 'Rest 0:45')
})

test('formatRestRow returns null for null rest_seconds (nothing to render)', () => {
  assert.equal(formatRestRow(null), null)
})

test('formatRestRow returns null for undefined rest_seconds', () => {
  assert.equal(formatRestRow(undefined), null)
})

test('formatRestRow returns null for zero rest_seconds (no rest recorded)', () => {
  assert.equal(formatRestRow(0), null)
})
