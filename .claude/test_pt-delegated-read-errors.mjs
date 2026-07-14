import { test } from 'node:test'
import assert from 'node:assert/strict'

const { DataAccessError, isAuthorizationDenied } = await import(
  '../src/lib/dataAccessError.ts'
)

test('delegated reads recognize only PostgreSQL authorization denials', () => {
  assert.equal(
    isAuthorizationDenied(new DataAccessError('load delegated results', {
      code: '42501',
      message: 'delegated result access is not allowed',
    })),
    true,
  )
  assert.equal(
    isAuthorizationDenied(new DataAccessError('load delegated results', {
      code: '57014',
      message: 'query canceled',
    })),
    false,
  )
  assert.equal(isAuthorizationDenied({ code: '42501' }), false)
  assert.equal(isAuthorizationDenied(null), false)
})
