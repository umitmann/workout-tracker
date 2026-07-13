import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const dalSource = await readFile(new URL('../src/lib/dal.ts', import.meta.url), 'utf8')

test('the regular user DAL is explicitly server-only', () => {
  assert.match(dalSource, /^import ['"]server-only['"]/)
})

test('the regular user DAL never constructs a service-role client', () => {
  assert.doesNotMatch(dalSource, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(dalSource, /createServiceSupabaseClient/)
})

test('exercise catalog reads use the authenticated request context', () => {
  assert.match(
    dalSource,
    /export async function getAllExercises\(\)[\s\S]*?getAuthContext\(\)/,
  )
})
