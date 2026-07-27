import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AUDIT_ARGS, isAuditServiceFailure } from '../scripts/audit-dependencies.mjs'

test('dependency audit gates production dependencies at high severity', () => {
  assert.deepEqual(AUDIT_ARGS, ['audit', '--omit=dev', '--audit-level=high'])
})

test('dependency audit recognizes registry transport failures only', () => {
  assert.equal(isAuditServiceFailure('npm error audit endpoint returned an error'), true)
  assert.equal(isAuditServiceFailure('invalid json response body at advisories/bulk'), true)
  assert.equal(isAuditServiceFailure('400 Bad Request - security/audits/quick'), true)
})

test('dependency audit never classifies real vulnerability findings as an outage', () => {
  assert.equal(isAuditServiceFailure('12 high severity vulnerabilities'), false)
  assert.equal(isAuditServiceFailure('brace-expansion: DoS via unbounded expansion'), false)
})
