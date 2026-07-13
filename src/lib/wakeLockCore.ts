// Pure, DOM-free wake-lock lifecycle core (ADR-0007, findings H5/L6). No
// React, no `navigator` reference — `useWakeLock.ts` is a thin adapter that
// feeds real browser events into this controller. Extracted so the
// acquire/release/re-acquire decision logic is unit-testable without a
// renderer (no jsdom/testing-library in this repo).
//
// Contract:
//   - active:true  -> request('screen') once
//   - visibilitychange hidden->visible while active -> re-request
//   - active:false or teardown() -> release whatever is held (or, if a
//     request is still in flight, release it as soon as it resolves —
//     never leak a lock that arrives after we've already gone inactive)
//   - no wakeLock API available -> every method is a silent no-op
//
// `visibilityState` transition tracking treats duplicate 'visible' events
// (already visible) as no-ops — only the hidden->visible edge re-requests,
// matching the browser's own behaviour of only ever releasing on hide.

export type WakeLockSentinelLike = {
  release: () => Promise<void>
}

export type WakeLockApiLike = {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>
}

export type WakeLockController = {
  setActive: (active: boolean) => void
  onVisibilityChange: (state: 'visible' | 'hidden') => void
  teardown: () => void
  // Test/adapter hook: resolves once no acquire/release is in flight. The
  // real hook does not need this — effects don't await — but it makes the
  // core's async edges deterministically testable.
  idle: () => Promise<void>
}

export function createWakeLockController(deps: { wakeLock: WakeLockApiLike | undefined | null }): WakeLockController {
  const api = deps.wakeLock
  let active = false
  let visible = true
  let torndown = false
  let sentinel: WakeLockSentinelLike | null = null
  // The in-flight request() promise, if any. Tracked so a deactivate that
  // happens before it settles can release the sentinel the instant it
  // arrives, and so idle() can wait on it.
  let pending: Promise<void> | null = null

  function releaseSentinel() {
    if (!sentinel) return
    const s = sentinel
    sentinel = null
    s.release().catch(() => {
      /* already released / revoked out-of-band — nothing to do */
    })
  }

  function requestLock() {
    if (!api) return
    // A request is already in flight — its own resolution handler will
    // re-check `active`/`torndown` at that time, so a second concurrent
    // request here would only risk holding two sentinels at once.
    if (pending) return
    pending = api
      .request('screen')
      .then((s) => {
        pending = null
        if (torndown || !active) {
          // Went inactive (or torn down) while the request was in flight —
          // don't leak the lock we just received.
          s.release().catch(() => {})
          return
        }
        sentinel = s
      })
      .catch(() => {
        // Denied / not visible / any rejection — swallow, matches the
        // original hook's `catch { /* ignore */ }`.
        pending = null
      })
  }

  return {
    setActive(next) {
      if (torndown) return
      if (next === active) return
      active = next
      if (active) {
        requestLock()
      } else {
        releaseSentinel()
      }
    },

    onVisibilityChange(state) {
      if (torndown) return
      const wasVisible = visible
      visible = state === 'visible'
      if (!wasVisible && visible && active) {
        requestLock()
      }
    },

    teardown() {
      if (torndown) return
      torndown = true
      active = false
      releaseSentinel()
    },

    async idle() {
      while (pending) {
        await pending
      }
    },
  }
}
