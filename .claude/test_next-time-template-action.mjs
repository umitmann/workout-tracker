import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('next-time mutation is scoped through the authenticated workout and linked owned template', async () => {
  const source = await readFile(new URL('../src/app/actions/templates.ts', import.meta.url), 'utf8')
  const start = source.indexOf('export async function updateLinkedTemplateFromWorkout')
  const body = source.slice(start)
  assert.match(body, /supabase\.auth\.getUser\(\)/)
  assert.match(body, /\.from\('workouts'\)[\s\S]*\.eq\('user_id', user\.id\)/)
  assert.match(body, /workout\.template_id/)
  assert.match(body, /\.from\('routines'\)[\s\S]*\.eq\('user_id', user\.id\)/)
  assert.match(body, /\.from\('sets'\)[\s\S]*\.eq\('user_id', user\.id\)/)
  assert.match(body, /saveTemplateExercisesCore\(supabase/)
  assert.doesNotMatch(body, /service_role|SUPABASE_SERVICE_ROLE/)
})
