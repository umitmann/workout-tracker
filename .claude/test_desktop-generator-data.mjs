import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const dal = await readFile(new URL('../src/lib/dal.ts', import.meta.url), 'utf8')
const picker = await readFile(new URL('../src/app/workout/[id]/ExercisePickerSheet.tsx', import.meta.url), 'utf8')

test('exercise directory prefers detailed metadata and keeps rolling v2/v1 fallbacks', () => {
  const v3 = dal.indexOf("rpc('list_available_exercises_v3')")
  const v2 = dal.indexOf("rpc('list_available_exercises_v2')")
  const v1 = dal.indexOf("rpc('list_available_exercises')")
  assert.ok(v3 >= 0, 'v3 exercise RPC must be called')
  assert.ok(v2 >= 0, 'v2 exercise RPC must be called')
  assert.ok(v2 > v3, 'v2 fallback must happen after the v3 attempt')
  assert.ok(v1 > v2, 'v1 fallback must happen after the v2 attempt')
  assert.match(dal, /muscles_secondary: string\[\] \| null/)
  assert.match(dal, /muscles_detailed: string\[\] \| null/)
  assert.match(dal, /muscles_secondary_detailed: string\[\] \| null/)
  assert.match(dal, /select\('id, name, category, equipment, muscles, muscles_secondary'\)/)
})

test('the shared exercise DTO carries secondary muscles without changing picker requirements', () => {
  assert.match(picker, /muscles_secondary\?: string\[\] \| null/)
  assert.match(picker, /muscles_detailed\?: string\[\] \| null/)
  assert.match(picker, /muscles_secondary_detailed\?: string\[\] \| null/)
})
