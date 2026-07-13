/**
 * RED tests for WP-07 — src/lib/wakeLockCore.ts (ADR-0007, findings H5/L6).
 * React cannot be unit-tested here without a renderer (no testing-library in
 * deps, no jsdom) — so the acquire/release/re-acquire *decision logic* is
 * extracted into a pure, DOM-free core and the hook becomes a thin adapter
 * over it. This file pins the lifecycle contract directly against the core:
 *
 *   - active:true  -> request('screen') called once
 *   - visibility hidden -> visible while active -> re-requested
 *   - active:false / teardown -> released; no throw when the API is absent
 *
 * Variant emphasis: ROBUSTNESS — exhaustive interruption/failure/ordering
 * edge cases beyond the ADR's minimal contract (denial, revocation races,
 * rapid toggling, double-teardown, concurrent acquire attempts).
 *
 * Run: node --import tsx --test .claude/test_wake-lock.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { createWakeLockController } = await import('../src/lib/wakeLockCore.ts')

// A controllable fake of the WakeLockSentinel + WakeLock API surface. Each
// request() call returns a fresh sentinel; tests can resolve/reject requests
// on demand and observe/trigger release independently, which is exactly what
// the real browser API racing a re-request would look like.
function fakeWakeLockApi() {
  const requests = []
  const sentinels = []
  let nextResult = () => Promise.resolve(makeSentinel())

  function makeSentinel() {
    const sentinel = {
      released: false,
      releaseCalls: 0,
      release: async () => {
        sentinel.releaseCalls++
        sentinel.released = true
      },
    }
    sentinels.push(sentinel)
    return sentinel
  }

  const api = {
    requests,
    sentinels,
    request: (type) => {
      const call = { type }
      requests.push(call)
      return nextResult()
    },
    // Test control: next request() will resolve with this sentinel/value.
    resolveNextWith(fn) {
      nextResult = fn
    },
  }
  return api
}

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// ─── Baseline ADR-0007 contract ─────────────────────────────────────────────

test('active:true requests screen wake lock exactly once', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(true)
  await controller.idle()
  assert.equal(api.requests.length, 1)
  assert.equal(api.requests[0].type, 'screen')
})

test('active:false never requests', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(false)
  await controller.idle()
  assert.equal(api.requests.length, 0)
})

test('visibility hidden -> visible while active re-requests', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(true)
  await controller.idle()
  assert.equal(api.requests.length, 1)

  controller.onVisibilityChange('hidden')
  await controller.idle()
  // The browser itself releases the sentinel when the tab hides — hidden
  // alone must not trigger a redundant explicit release call from us, and
  // must not re-request while still hidden.
  assert.equal(api.requests.length, 1)

  controller.onVisibilityChange('visible')
  await controller.idle()
  assert.equal(api.requests.length, 2)
})

test('visibility change to visible while inactive does not request', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(false)
  controller.onVisibilityChange('visible')
  await controller.idle()
  assert.equal(api.requests.length, 0)
})

test('active -> false releases the held sentinel', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(true)
  await controller.idle()
  const sentinel = api.sentinels[0]
  assert.equal(sentinel.released, false)

  controller.setActive(false)
  await controller.idle()
  assert.equal(sentinel.released, true)
  assert.equal(sentinel.releaseCalls, 1)
})

test('teardown releases the held sentinel', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(true)
  await controller.idle()
  const sentinel = api.sentinels[0]

  controller.teardown()
  await controller.idle()
  assert.equal(sentinel.released, true)
})

test('no navigator.wakeLock -> silent no-op, never throws', async () => {
  const controller = createWakeLockController({ wakeLock: undefined })
  assert.doesNotThrow(() => controller.setActive(true))
  await controller.idle()
  assert.doesNotThrow(() => controller.onVisibilityChange('visible'))
  assert.doesNotThrow(() => controller.setActive(false))
  assert.doesNotThrow(() => controller.teardown())
})

// ─── Robustness: denial / rejection paths ───────────────────────────────────

test('request() rejection (denied / not visible) is swallowed, no throw, no held sentinel', async () => {
  const api = fakeWakeLockApi()
  api.resolveNextWith(() => Promise.reject(new Error('NotAllowedError')))
  const controller = createWakeLockController({ wakeLock: api })
  assert.doesNotThrow(() => controller.setActive(true))
  await controller.idle()
  assert.equal(api.requests.length, 1)
})

test('after a denied request, a later visibility re-request can still succeed', async () => {
  const api = fakeWakeLockApi()
  api.resolveNextWith(() => Promise.reject(new Error('NotAllowedError')))
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(true)
  await controller.idle()

  api.resolveNextWith(() => Promise.resolve({ released: false, releaseCalls: 0, release: async () => {} }))
  controller.onVisibilityChange('hidden')
  controller.onVisibilityChange('visible')
  await controller.idle()
  assert.equal(api.requests.length, 2)
})

test('deactivating while a request is still pending releases it once it resolves (no leaked lock)', async () => {
  const api = fakeWakeLockApi()
  const gate = deferred()
  let sentinel
  api.resolveNextWith(() => gate.promise.then(() => {
    sentinel = { released: false, releaseCalls: 0, release: async () => { sentinel.released = true; sentinel.releaseCalls++ } }
    return sentinel
  }))
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(true)
  controller.setActive(false) // deactivate before the request settles
  gate.resolve()
  await controller.idle()
  assert.equal(sentinel.released, true, 'a lock resolved after going inactive must be released, not leaked')
})

test('deactivating while pending, then reactivating before it resolves, still ends up holding exactly one lock', async () => {
  const api = fakeWakeLockApi()
  const gate = deferred()
  api.resolveNextWith(() => gate.promise.then(() => ({ released: false, releaseCalls: 0, release: async () => {} })))
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(true)
  controller.setActive(false)
  controller.setActive(true)
  gate.resolve()
  await controller.idle()
  // Only one request should have been issued for this uninterrupted pending
  // window — re-activating before the first settles must not fire a second
  // concurrent request.
  assert.equal(api.requests.length, 1)
})

// ─── Robustness: ordering / rapid toggling ──────────────────────────────────

test('rapid active toggling (true/false/true/false/true) settles to exactly one held sentinel, no duplicate requests in flight', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(true)
  controller.setActive(false)
  controller.setActive(true)
  controller.setActive(false)
  controller.setActive(true)
  await controller.idle()
  const released = api.sentinels.filter((s) => s.released).length
  const held = api.sentinels.length - released
  assert.equal(held, 1, `expected exactly one held sentinel, got ${held} held / ${released} released`)
})

test('setActive(true) called twice in a row (no change) does not double-request', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(true)
  await controller.idle()
  controller.setActive(true)
  await controller.idle()
  assert.equal(api.requests.length, 1)
})

test('setActive(false) called twice in a row (already inactive) is a no-op', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(false)
  controller.setActive(false)
  await controller.idle()
  assert.equal(api.requests.length, 0)
})

test('multiple visibilitychange(visible) events while already visible+active do not each re-request', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(true)
  await controller.idle()
  controller.onVisibilityChange('visible')
  controller.onVisibilityChange('visible')
  await controller.idle()
  // Spec requires re-request on the *transition* hidden->visible; being
  // told "visible" again while already visible is not such a transition.
  assert.equal(api.requests.length, 1)
})

test('hidden while inactive, then visible while still inactive: no request at any point', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  controller.onVisibilityChange('hidden')
  controller.onVisibilityChange('visible')
  await controller.idle()
  assert.equal(api.requests.length, 0)
})

// ─── Robustness: teardown / double-release / lifecycle edges ───────────────

test('teardown when never activated is a silent no-op', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  assert.doesNotThrow(() => controller.teardown())
  await controller.idle()
  assert.equal(api.requests.length, 0)
})

test('teardown does not release twice even if called repeatedly', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(true)
  await controller.idle()
  const sentinel = api.sentinels[0]
  controller.teardown()
  controller.teardown()
  await controller.idle()
  assert.equal(sentinel.releaseCalls, 1)
})

test('setActive after teardown does not resurrect the controller (no request fires)', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  controller.teardown()
  controller.setActive(true)
  await controller.idle()
  assert.equal(api.requests.length, 0)
})

test('onVisibilityChange after teardown is a no-op, no throw', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(true)
  await controller.idle()
  controller.teardown()
  assert.doesNotThrow(() => controller.onVisibilityChange('visible'))
  await controller.idle()
  assert.equal(api.requests.length, 1)
})

test('sentinel release() itself rejecting is swallowed, does not throw or hang idle()', async () => {
  const api = fakeWakeLockApi()
  api.resolveNextWith(() => Promise.resolve({
    released: false,
    releaseCalls: 0,
    release: async () => { throw new Error('release failed') },
  }))
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(true)
  await controller.idle()
  assert.doesNotThrow(() => controller.setActive(false))
  await controller.idle()
})

// ─── Robustness: externally-revoked sentinel (browser-driven release) ──────

test("browser-driven revocation (sentinel fires its own 'release' event) does not crash a later deactivate", async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(true)
  await controller.idle()
  const sentinel = api.sentinels[0]
  // Simulate the browser silently revoking the lock (e.g. low battery) —
  // sentinel.released flips true out-of-band, release() was never called by us.
  sentinel.released = true
  assert.doesNotThrow(() => controller.setActive(false))
  await controller.idle()
})

// ─── idle() semantics ────────────────────────────────────────────────────

test('idle() with nothing pending resolves immediately', async () => {
  const api = fakeWakeLockApi()
  const controller = createWakeLockController({ wakeLock: api })
  await controller.idle()
})

test('idle() waits for an in-flight request triggered by setActive before resolving', async () => {
  const api = fakeWakeLockApi()
  const gate = deferred()
  let requested = false
  api.resolveNextWith(() => {
    requested = true
    return gate.promise.then(() => ({ released: false, releaseCalls: 0, release: async () => {} }))
  })
  const controller = createWakeLockController({ wakeLock: api })
  controller.setActive(true)
  assert.equal(requested, true, 'request should fire synchronously-ish on setActive, not deferred to idle()')
  const idlePromise = controller.idle()
  let resolved = false
  idlePromise.then(() => { resolved = true })
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(resolved, false, 'idle() must not resolve while the request promise is still pending')
  gate.resolve()
  await idlePromise
  assert.equal(resolved, true)
})
