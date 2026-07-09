/**
 * Unit tests for errorBoundaryMessage — pure formatting of the Error object
 * Next.js forwards to error.tsx/global-error.tsx into a safe, user-facing
 * string. Extracted so both boundaries share one seam instead of duplicating
 * ad-hoc string logic (WP-13, finding M6).
 *
 * Next 16 passes Server Component errors with a generic message plus a
 * `digest` identifier (to avoid leaking details) but forwards the original
 * `message` verbatim for Client Component errors — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md.
 * This helper must never assume a message is present or safe to show raw;
 * it always produces a stable, friendly sentence and surfaces the digest
 * (when present) as a short reference code rather than raw error text.
 *
 * Run: node --import tsx --test .claude/test_error-boundary-message.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { formatBoundaryMessage } = await import('../src/lib/errorBoundaryMessage.ts')

test('plain Error with a message returns a friendly fallback sentence, not the raw message', () => {
  const err = new Error('TypeError: cannot read foo of undefined')
  const msg = formatBoundaryMessage(err)
  assert.equal(msg, 'Something went wrong loading this page.')
})

test('Error with a digest appends a short reference code', () => {
  const err = Object.assign(new Error('generic server error'), { digest: 'abc123' })
  const msg = formatBoundaryMessage(err)
  assert.equal(msg, 'Something went wrong loading this page. Reference: abc123')
})

test('Error with an empty-string digest is treated as absent (no dangling "Reference: ")', () => {
  const err = Object.assign(new Error('x'), { digest: '' })
  const msg = formatBoundaryMessage(err)
  assert.equal(msg, 'Something went wrong loading this page.')
})

test('non-Error / undefined input never throws and still returns the fallback sentence', () => {
  assert.equal(formatBoundaryMessage(undefined), 'Something went wrong loading this page.')
  assert.equal(formatBoundaryMessage(null), 'Something went wrong loading this page.')
  assert.equal(formatBoundaryMessage({}), 'Something went wrong loading this page.')
})

test('digest with surrounding whitespace is trimmed before display', () => {
  const err = Object.assign(new Error('x'), { digest: '  ref-42  ' })
  const msg = formatBoundaryMessage(err)
  assert.equal(msg, 'Something went wrong loading this page. Reference: ref-42')
})
