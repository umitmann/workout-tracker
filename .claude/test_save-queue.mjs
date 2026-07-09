/**
 * RED tests for WP-04 — src/lib/saveQueue.ts (ADR-0004 §2/§4, ADR-0006 pure
 * core). Pure module: no React, no DB — the queue serializes an async
 * `persist(snapshot)` call per key, coalescing overlapping requests to the
 * latest snapshot, and tracks dirty/pending/error state per key so
 * WorkoutLogger can render an aria-live "not saved" indicator without owning
 * any of the ordering logic itself.
 *
 * Run: node --import tsx --test .claude/test_save-queue.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { createSaveQueue } = await import('../src/lib/saveQueue.ts')

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// ─── Serialization ──────────────────────────────────────────────────────────

test('two saves enqueued concurrently execute sequentially, not overlapping', async () => {
  const order = []
  let inFlight = 0
  let maxConcurrent = 0
  const queue = createSaveQueue(async (snapshot) => {
    inFlight++
    maxConcurrent = Math.max(maxConcurrent, inFlight)
    order.push(`start:${snapshot}`)
    await new Promise((r) => setTimeout(r, 10))
    order.push(`end:${snapshot}`)
    inFlight--
    return { success: true }
  })

  const a = queue.enqueue('w1', 'A')
  const b = queue.enqueue('w1', 'B')
  await Promise.all([a, b])

  assert.equal(maxConcurrent, 1, 'persist() must never be in flight twice for the same key at once')
  assert.deepEqual(order, ['start:A', 'end:A', 'start:B', 'end:B'])
})

test('final persisted snapshot equals the later of two concurrently enqueued saves', async () => {
  const persisted = []
  const queue = createSaveQueue(async (snapshot) => {
    persisted.push(snapshot)
    return { success: true }
  })
  await Promise.all([queue.enqueue('w1', 'first'), queue.enqueue('w1', 'second')])
  assert.equal(persisted[persisted.length - 1], 'second')
})

test('a queued save coalesces to the latest state when several pile up while one is in flight', async () => {
  const persisted = []
  const first = deferred()
  let call = 0
  const queue = createSaveQueue(async (snapshot) => {
    call++
    persisted.push(snapshot)
    if (call === 1) await first.promise
    return { success: true }
  })

  const p1 = queue.enqueue('w1', 'v1') // starts persisting immediately
  const p2 = queue.enqueue('w1', 'v2') // queued while v1 in flight
  const p3 = queue.enqueue('w1', 'v3') // also queued — should coalesce with v2, not run separately

  first.resolve({ success: true }) // let v1's persist finish
  await Promise.all([p1, p2, p3])

  // Exactly two persist() calls: v1 (in flight when queued) + v3 (latest
  // coalesced state) — v2 must never be persisted on its own.
  assert.deepEqual(persisted, ['v1', 'v3'])
})

test('independent keys (different workouts) run without serializing against each other', async () => {
  const order = []
  const queue = createSaveQueue(async (snapshot) => {
    order.push(`start:${snapshot}`)
    await new Promise((r) => setTimeout(r, 5))
    order.push(`end:${snapshot}`)
    return { success: true }
  })
  await Promise.all([queue.enqueue('w1', 'A'), queue.enqueue('w2', 'B')])
  // Both start before either ends — proves keys are not cross-serialized.
  assert.deepEqual(order.slice(0, 2).sort(), ['start:A', 'start:B'])
})

// ─── Dirty / pending / error state ──────────────────────────────────────────

test('state starts clean: not dirty, not pending, no error', () => {
  const queue = createSaveQueue(async () => ({ success: true }))
  assert.deepEqual(queue.getState('w1'), { dirty: false, pending: false, error: null })
})

test('markDirty flips dirty without touching pending/error', () => {
  const queue = createSaveQueue(async () => ({ success: true }))
  queue.markDirty('w1')
  assert.deepEqual(queue.getState('w1'), { dirty: true, pending: false, error: null })
})

test('successful persist clears dirty and error', async () => {
  const queue = createSaveQueue(async () => ({ success: true }))
  queue.markDirty('w1')
  await queue.enqueue('w1', 'snapshot')
  assert.deepEqual(queue.getState('w1'), { dirty: false, pending: false, error: null })
})

test('failed persist leaves dirty set and records the error', async () => {
  const queue = createSaveQueue(async () => ({ error: 'network blip' }))
  queue.markDirty('w1')
  await queue.enqueue('w1', 'snapshot')
  const state = queue.getState('w1')
  assert.equal(state.dirty, true)
  assert.equal(state.pending, false)
  assert.equal(state.error, 'network blip')
})

test('pending is true only while a persist for that key is in flight', async () => {
  const gate = deferred()
  const queue = createSaveQueue(async () => {
    await gate.promise
    return { success: true }
  })
  const p = queue.enqueue('w1', 'snapshot')
  // Microtask boundary: allow enqueue's synchronous scheduling to run.
  await Promise.resolve()
  assert.equal(queue.getState('w1').pending, true)
  gate.resolve()
  await p
  assert.equal(queue.getState('w1').pending, false)
})

test('a thrown persist (network exception, not a returned {error}) still leaves dirty and records an error', async () => {
  const queue = createSaveQueue(async () => { throw new Error('fetch failed') })
  queue.markDirty('w1')
  await queue.enqueue('w1', 'snapshot')
  const state = queue.getState('w1')
  assert.equal(state.dirty, true)
  assert.equal(state.pending, false)
  assert.match(state.error, /fetch failed/)
})

test('coalesced save that ultimately succeeds clears dirty even though an intermediate attempt was skipped', async () => {
  const first = deferred()
  let call = 0
  const queue = createSaveQueue(async () => {
    call++
    if (call === 1) await first.promise
    return { success: true }
  })
  queue.markDirty('w1')
  const p1 = queue.enqueue('w1', 'v1')
  const p2 = queue.enqueue('w1', 'v2')
  first.resolve()
  await Promise.all([p1, p2])
  assert.deepEqual(queue.getState('w1'), { dirty: false, pending: false, error: null })
})

test('enqueue resolves with the result of the persist call that actually wrote its snapshot', async () => {
  const queue = createSaveQueue(async (snapshot) =>
    snapshot === 'bad' ? { error: 'boom' } : { success: true },
  )
  const result = await queue.enqueue('w1', 'bad')
  assert.deepEqual(result, { error: 'boom' })
})

test('idle() resolves only after the in-flight persist AND any coalesced follow-up complete', async () => {
  const order = []
  let release
  const gate = new Promise((r) => { release = r })
  const queue = createSaveQueue(async (snapshot) => {
    order.push(`start:${snapshot}`)
    if (snapshot === 'a') await gate
    order.push(`end:${snapshot}`)
    return { success: true }
  })
  const first = queue.enqueue('w1', 'a')
  const second = queue.enqueue('w1', 'b') // coalesced behind the in-flight 'a'
  const idle = queue.idle('w1').then(() => order.push('idle'))
  release()
  await Promise.all([first, second, idle])
  assert.deepEqual(order, ['start:a', 'end:a', 'start:b', 'end:b', 'idle'])
})

test('idle() on a key with nothing in flight resolves immediately', async () => {
  const queue = createSaveQueue(async () => ({ success: true }))
  await queue.idle('untouched')
})
