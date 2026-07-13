import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [dalSource, trainerRelationshipDalSource] = await Promise.all([
  readFile(new URL('../src/lib/dal.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/trainerRelationshipDal.ts', import.meta.url), 'utf8'),
])

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

test('trainer relationship reads are server-only and use only narrow participant RPCs', () => {
  assert.match(trainerRelationshipDalSource, /^import ['"]server-only['"]/)
  assert.doesNotMatch(trainerRelationshipDalSource, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(trainerRelationshipDalSource, /\.from\(['"](?:workouts|sets|body_weights|trainer_relationships|trainer_access_grants)/)
  assert.match(trainerRelationshipDalSource, /\.rpc\(['"]list_my_trainer_relationships['"]\)/)
  assert.match(trainerRelationshipDalSource, /\.rpc\(['"]list_trainer_relationship_audit['"]/)
})
