import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('last-performance query orders completed workout rows before applying limit one', async () => {
  const source = await readFile(new URL('../src/lib/dal.ts', import.meta.url), 'utf8')
  const start = source.indexOf('export async function getLastExercisePerformance')
  const end = source.indexOf('export async function getBestExercisePerformance', start)
  const body = source.slice(start, end)
  assert.match(body, /\.from\('workouts'\)/)
  assert.match(body, /sets!inner/)
  assert.match(body, /\.eq\('sets\.exercise_id', exerciseId\)/)
  assert.match(body, /\.order\('date', \{ ascending: false \}\)[\s\S]*\.limit\(1\)/)
  assert.doesNotMatch(body, /foreignTable:\s*'workouts'/)
})
