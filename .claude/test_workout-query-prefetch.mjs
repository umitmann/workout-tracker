import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const { createAsyncResourceCache } = await import('../src/lib/asyncResourceCache.ts')

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('query cache deduplicates pending work and caches null results', async () => {
  const cache = createAsyncResourceCache()
  let calls = 0
  const loader = async () => {
    calls += 1
    await Promise.resolve()
    return null
  }

  const [first, second] = await Promise.all([
    cache.get('best:7', loader),
    cache.get('best:7', loader),
  ])
  assert.equal(first, null)
  assert.equal(second, null)
  assert.equal(calls, 1)
  assert.deepEqual(cache.read('best:7'), { found: true, value: null })
  await cache.get('best:7', loader)
  assert.equal(calls, 1)
})

test('failed prefetches are not cached and retry on explicit use', async () => {
  const cache = createAsyncResourceCache()
  let calls = 0
  await assert.rejects(cache.get(7, async () => {
    calls += 1
    throw new Error('temporary')
  }))
  assert.deepEqual(cache.read(7), { found: false })
  assert.equal(await cache.get(7, async () => {
    calls += 1
    return 'ready'
  }), 'ready')
  assert.equal(calls, 2)
})

test('workout warms every exercise query and button handlers consume the cache', async () => {
  const logger = await source('../src/app/workout/[id]/WorkoutLogger.tsx')
  assert.match(logger, /createAsyncResourceCache/)
  assert.match(logger, /warmExerciseQueries/)
  assert.match(logger, /fetchExerciseDetails/)
  assert.match(logger, /fetchBestExercisePerformance/)
  assert.match(logger, /fetchBestExercisePerformance60Days/)
  assert.match(logger, /infoQueryCache\.read/)
  assert.match(logger, /perfQueryCache\.read/)
  assert.match(logger, /perfQueryCache\.seed/)
})
