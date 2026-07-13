/**
 * Unit tests for modalStack — tracks which mounted Modal instance is
 * topmost so a stacked dialog (e.g. exercise info opened from within the
 * picker sheet) captures Escape/Tab instead of the sheet underneath it.
 * WP-08 / ADR-0008. Scenario: modal-a11y-core.
 * Run: node --import tsx --test .claude/test_modal-stack.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { pushModal, popModal, isTopmost } = await import('../src/lib/modalStack.ts')

test('a single pushed modal is topmost', () => {
  const a = pushModal()
  assert.equal(isTopmost(a), true)
  popModal(a)
})

test('the most recently pushed modal is topmost; the earlier one is not', () => {
  const sheet = pushModal()
  const infoModal = pushModal()
  assert.equal(isTopmost(sheet), false)
  assert.equal(isTopmost(infoModal), true)
  popModal(infoModal)
  popModal(sheet)
})

test('popping the topmost modal restores the one beneath it', () => {
  const sheet = pushModal()
  const infoModal = pushModal()
  popModal(infoModal)
  assert.equal(isTopmost(sheet), true)
  popModal(sheet)
})

test('popping an already-popped token is a no-op (safe against StrictMode double effects)', () => {
  const a = pushModal()
  popModal(a)
  popModal(a)
  assert.equal(isTopmost(a), false)
})

test('an unregistered/unknown token is never topmost', () => {
  const a = pushModal()
  const unknown = Symbol('never pushed')
  assert.equal(isTopmost(unknown), false)
  popModal(a)
})

test('with nothing pushed, nothing is topmost', () => {
  const a = Symbol('stray')
  assert.equal(isTopmost(a), false)
})
