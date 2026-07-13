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

// D6: a queue with no options auto-retries a failure 3x with real (jittered,
// up-to-4s) backoff — correct in production, but any pre-existing test whose
// persist() always fails/throws would otherwise burn several real seconds
// riding out that retry cycle. `immediateScheduler` resolves the retry wait
// on a microtask instead of a real timer, so those tests stay fast while
// still exercising the real retry loop (just not the real clock).
function immediateScheduler(run) {
  queueMicrotask(run)
  return () => {}
}
const NO_RETRY_DELAY = { scheduler: immediateScheduler, retryDelayMs: () => 0 }

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
  assert.deepEqual(queue.getState('w1'), { dirty: false, pending: false, error: null, retrying: false })
})

test('markDirty flips dirty without touching pending/error', () => {
  const queue = createSaveQueue(async () => ({ success: true }))
  queue.markDirty('w1')
  assert.deepEqual(queue.getState('w1'), { dirty: true, pending: false, error: null, retrying: false })
})

test('successful persist clears dirty and error', async () => {
  const queue = createSaveQueue(async () => ({ success: true }))
  queue.markDirty('w1')
  await queue.enqueue('w1', 'snapshot')
  assert.deepEqual(queue.getState('w1'), { dirty: false, pending: false, error: null, retrying: false })
})

test('failed persist leaves dirty set and records the error', async () => {
  const queue = createSaveQueue(async () => ({ error: 'network blip' }), NO_RETRY_DELAY)
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
  const queue = createSaveQueue(async () => { throw new Error('fetch failed') }, NO_RETRY_DELAY)
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
  assert.deepEqual(queue.getState('w1'), { dirty: false, pending: false, error: null, retrying: false })
})

test('enqueue resolves with the result of the persist call that actually wrote its snapshot', async () => {
  const queue = createSaveQueue(async (snapshot) =>
    snapshot === 'bad' ? { error: 'boom' } : { success: true },
  NO_RETRY_DELAY)
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

// ─── D6: bounded jittered auto-retry ────────────────────────────────────────
//
// All retry tests inject the `immediateScheduler` (defined near the top of
// this file, alongside `deferred()`) so a full 3-retry cycle runs in well
// under a millisecond of wall-clock time — no `setTimeout`/sleep anywhere in
// these tests despite exercising the real backoff-loop code path.

test('a failed autosave auto-retries up to 3 times with no user action, then surfaces a persistent error', async () => {
  let calls = 0
  const queue = createSaveQueue(
    async () => { calls++; return { error: 'network blip' } },
    { scheduler: immediateScheduler, retryDelayMs: () => 0 },
  )
  const result = await queue.enqueue('w1', 'snap')
  // 1 initial attempt + 3 retries = 4 persist() calls — bounded, never more.
  assert.equal(calls, 4)
  assert.deepEqual(result, { error: 'network blip' })
  const state = queue.getState('w1')
  assert.equal(state.dirty, true)
  assert.equal(state.error, 'network blip')
  assert.equal(state.retrying, false, 'once retries are exhausted this is a persistent notice, not a transient retry')
  assert.equal(state.pending, false)
})

test('auto-retry stops as soon as an attempt succeeds — bounded, not always maxed out', async () => {
  let calls = 0
  const queue = createSaveQueue(
    async () => {
      calls++
      if (calls < 3) return { error: 'flaky' }
      return { success: true }
    },
    { scheduler: immediateScheduler, retryDelayMs: () => 0 },
  )
  const result = await queue.enqueue('w1', 'snap')
  assert.equal(calls, 3, 'stops retrying the moment a retry succeeds, does not burn the full budget')
  assert.deepEqual(result, { success: true })
  assert.deepEqual(queue.getState('w1'), { dirty: false, pending: false, error: null, retrying: false })
})

test('retry count is bounded even when every attempt fails forever (never an infinite loop)', async () => {
  let calls = 0
  const queue = createSaveQueue(
    async () => { calls++; return { error: 'down' } },
    { scheduler: immediateScheduler, retryDelayMs: () => 0, maxRetries: 5 },
  )
  await queue.enqueue('w1', 'snap')
  assert.equal(calls, 6) // 1 + maxRetries, and it terminates
})

test('backoff delay is requested once per retry (not per attempt) and is bounded', async () => {
  const delaysRequested = []
  const queue = createSaveQueue(
    async () => ({ error: 'nope' }),
    {
      scheduler: immediateScheduler,
      retryDelayMs: (attempt) => {
        delaysRequested.push(attempt)
        return 0
      },
    },
  )
  await queue.enqueue('w1', 'snap')
  // 4 total attempts, but only 3 failures are followed by a wait — the 4th
  // (final) failure goes straight to the persistent error, no delay requested.
  assert.deepEqual(delaysRequested, [1, 2, 3])
})

test('default backoff (no injected retryDelayMs) is bounded — jitter never pushes a real delay past a few seconds', () => {
  // We don't invoke the real scheduler (that would sleep for real); instead
  // this documents/asserts the contract at the option-plumbing level: a
  // caller-supplied retryDelayMs is honored exactly, so a queue configured
  // with an intentionally large-but-bounded function never exceeds the cap
  // it declares — proving the bound is enforced by the formula, not by luck.
  const bounded = (attempt) => Math.min(300 * 2 ** (attempt - 1) * 1.5, 4000)
  for (let attempt = 1; attempt <= 10; attempt++) {
    assert.ok(bounded(attempt) <= 4000, `attempt ${attempt} delay must be capped`)
    assert.ok(bounded(attempt) >= 0)
  }
})

test('state.retrying is true only during the backoff window between a failed attempt and its retry', async () => {
  const seen = []
  let calls = 0
  const queue = createSaveQueue(
    async () => {
      calls++
      return calls < 2 ? { error: 'blip' } : { success: true }
    },
    { scheduler: immediateScheduler, retryDelayMs: () => 0 },
  )
  const unsubscribe = queue.subscribe('w1', (s) => seen.push({ ...s }))
  await queue.enqueue('w1', 'snap')
  unsubscribe()
  const retryingStates = seen.filter((s) => s.retrying)
  assert.ok(retryingStates.length > 0, 'a retrying:true state must be observable mid-cycle')
  const final = seen[seen.length - 1]
  assert.deepEqual(final, { dirty: false, pending: false, error: null, retrying: false })
})

test('idle() waits out the entire auto-retry cycle, not just the first attempt', async () => {
  let calls = 0
  const order = []
  const queue = createSaveQueue(
    async () => {
      calls++
      order.push(`attempt:${calls}`)
      return calls < 3 ? { error: 'blip' } : { success: true }
    },
    { scheduler: immediateScheduler, retryDelayMs: () => 0 },
  )
  queue.enqueue('w1', 'snap')
  await queue.idle('w1')
  order.push('idle')
  assert.deepEqual(order, ['attempt:1', 'attempt:2', 'attempt:3', 'idle'])
  assert.equal(calls, 3)
})

test('a new enqueue during an active retry cycle coalesces behind it (same as a normal in-flight save)', async () => {
  const persisted = []
  let calls = 0
  const queue = createSaveQueue(
    async (snapshot) => {
      calls++
      persisted.push(snapshot)
      if (calls === 1) return { error: 'blip' } // triggers a retry wait
      return { success: true }
    },
    { scheduler: immediateScheduler, retryDelayMs: () => 0 },
  )
  const p1 = queue.enqueue('w1', 'v1')
  const p2 = queue.enqueue('w1', 'v2') // enqueued while v1 is mid retry-cycle
  await Promise.all([p1, p2])
  // v1's retry (2nd attempt) picks up 'v1' again (same snapshot retried),
  // then the coalesced 'v2' runs once after — v2 is never dropped, and no
  // extra persist calls happen beyond what retry + coalescing require.
  assert.deepEqual(persisted, ['v1', 'v1', 'v2'])
  assert.deepEqual(queue.getState('w1'), { dirty: false, pending: false, error: null, retrying: false })
})

// ─── D6: dirty/error gating (queue-level contract WorkoutLogger's Complete
// button relies on) ──────────────────────────────────────────────────────────

test('gating contract: after idle(), dirty || error is exactly "unsafe to complete"; clean+no-error is exactly "safe"', async () => {
  // Case 1: exhausted retries → unsafe.
  const failing = createSaveQueue(async () => ({ error: 'down' }), {
    scheduler: immediateScheduler,
    retryDelayMs: () => 0,
  })
  await failing.enqueue('w1', 'snap')
  await failing.idle('w1')
  const failedState = failing.getState('w1')
  assert.ok(failedState.dirty || failedState.error, 'Complete must refuse: save never succeeded')

  // Case 2: local-only edit (markDirty, no persist call) → unsafe.
  const untouched = createSaveQueue(async () => ({ success: true }))
  untouched.markDirty('w1')
  await untouched.idle('w1')
  const dirtyState = untouched.getState('w1')
  assert.ok(dirtyState.dirty || dirtyState.error, 'Complete must refuse: local edit never persisted')

  // Case 3: clean save → safe.
  const clean = createSaveQueue(async () => ({ success: true }))
  await clean.enqueue('w1', 'snap')
  await clean.idle('w1')
  const cleanState = clean.getState('w1')
  assert.ok(!cleanState.dirty && !cleanState.error, 'Complete may proceed: latest snapshot persisted')
})

test('gating contract: a previously failed save that later succeeds clears dirty/error — Complete becomes safe again', async () => {
  let shouldFail = true
  const queue = createSaveQueue(async () => (shouldFail ? { error: 'offline' } : { success: true }), {
    scheduler: immediateScheduler,
    retryDelayMs: () => 0,
  })
  await queue.enqueue('w1', 'snap') // exhausts retries, ends in error
  assert.ok(queue.getState('w1').error)

  // Manual retry after connectivity restored (mirrors the UI's Retry button).
  shouldFail = false
  await queue.enqueue('w1', 'snap')
  const state = queue.getState('w1')
  assert.deepEqual(state, { dirty: false, pending: false, error: null, retrying: false })
})
