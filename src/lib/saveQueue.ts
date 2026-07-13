// Per-key serialized save queue with dirty/pending/error tracking (ADR-0004
// §2/§4, ADR-0006 pure core). No React, no DB — WorkoutLogger owns a single
// instance and calls `enqueue(workoutId, snapshot)` from every persistence
// call site; this module owns all the ordering/coalescing/state/retry logic
// so it is unit-testable without a browser (see .claude/test_save-queue.mjs).
//
// Why a queue at all (finding H1): every set action used to fire an
// unserialized save. Two rapid adds could race — call A's write landing
// after call B's — leaving a stale snapshot. Serializing per key makes that
// impossible; coalescing means a burst of edits collapses to one save of the
// final state instead of N sequential ones.
//
// D6: a failed persist auto-retries up to `maxRetries` times with jittered
// backoff before giving up and surfacing a persistent error — see
// `docs/dockets/D6-save-queue-retry-gating.md`. The delay/scheduler are
// injectable so tests never sleep for real.

// `success` is `boolean` (not the literal `true`) because a 'use server'
// action's return value crosses the RSC boundary and loses literal narrowing.
export type SaveResult = { success?: boolean; error?: string }
export type PersistFn<TSnapshot> = (snapshot: TSnapshot) => Promise<SaveResult>

export type SaveState = {
  dirty: boolean
  pending: boolean
  error: string | null
  // True only while an auto-retry attempt is scheduled/running after a
  // failure and before the retry budget is exhausted. `error` stays null
  // during this window — it is set only once retries are exhausted, which
  // is what turns the transient retry cycle into the persistent notice.
  retrying: boolean
}

const CLEAN_STATE: SaveState = { dirty: false, pending: false, error: null, retrying: false }

// Cancels a scheduled callback. Returned by `scheduler` so a queue could, in
// principle, cancel a pending retry — not currently exercised, but keeping
// the shape symmetric with `setTimeout`/`clearTimeout` costs nothing.
type Cancel = () => void
export type Scheduler = (run: () => void, delayMs: number) => Cancel

export type SaveQueueOptions = {
  // Bounded: total attempts per snapshot is 1 + maxRetries (default 3
  // retries after the first failure = 4 attempts max). Never unbounded.
  maxRetries?: number
  // delay before retry attempt N (1-indexed: the delay awaited after the
  // Nth failure). Default is exponential backoff with bounded jitter.
  retryDelayMs?: (attempt: number) => number
  // How a retry's delay is actually waited out. Default uses a real
  // setTimeout; tests inject a scheduler that resolves synchronously (or on
  // a microtask) so retry tests never sleep for real wall-clock time.
  scheduler?: Scheduler
}

function defaultRetryDelayMs(attempt: number): number {
  // 300ms, 600ms, 1200ms base, each with up to +50% jitter, capped at 4s —
  // bounded on both ends so backoff can never grow unbounded and jitter can
  // never exceed a fixed fraction of the base (no thundering herd, no runaway wait).
  const base = 300 * 2 ** (attempt - 1)
  const jitter = Math.random() * base * 0.5
  return Math.min(base + jitter, 4000)
}

function defaultScheduler(run: () => void, delayMs: number): Cancel {
  const handle = setTimeout(run, delayMs)
  return () => clearTimeout(handle)
}

type KeyState<TSnapshot> = {
  state: SaveState
  // The in-flight persist promise for this key, if any — new enqueue() calls
  // chain after it rather than starting a second concurrent persist. Stays
  // set for the *entire* retry cycle (all attempts), so `idle()` correctly
  // waits out auto-retries, not just the first attempt.
  inFlight: Promise<SaveResult> | null
  // The most recent snapshot requested while a persist was in flight, and
  // the callers waiting on it — coalesced into a single follow-up persist.
  pendingSnapshot: TSnapshot | null
  pendingWaiters: ((result: SaveResult) => void)[]
  listeners: Set<(state: SaveState) => void>
}

export type SaveQueue<TSnapshot> = {
  // Serializes `persist(snapshot)` per key; concurrent calls for the same key
  // coalesce to the latest snapshot. Resolves with the result of whichever
  // persist call actually wrote the caller's snapshot (or a later one that
  // superseded it) — including any auto-retries along the way.
  enqueue(key: string, snapshot: TSnapshot): Promise<SaveResult>
  // Marks a key dirty without persisting — for local-only edits/deletes
  // (checklist §15.6/§15.7) that need the "unsaved changes" indicator to
  // light up before the next save clears it.
  markDirty(key: string): void
  getState(key: string): SaveState
  // Resolves once no persist is in flight or queued for this key, including
  // any auto-retry cycle. Used by the completeWorkout path so the terminal
  // save cannot overlap an autosave (ADR-0004 §2 — overlapping snapshot
  // saves must be impossible).
  idle(key: string): Promise<void>
  // Notifies `listener` synchronously on every state transition for `key`
  // (pending → retrying → error/clean, etc.) so the UI can render the
  // in-progress auto-retry, not just the state once the whole cycle settles.
  // Returns an unsubscribe function.
  subscribe(key: string, listener: (state: SaveState) => void): () => void
}

export function createSaveQueue<TSnapshot>(
  persist: PersistFn<TSnapshot>,
  options: SaveQueueOptions = {},
): SaveQueue<TSnapshot> {
  const keys = new Map<string, KeyState<TSnapshot>>()
  const maxRetries = options.maxRetries ?? 3
  const retryDelayMs = options.retryDelayMs ?? defaultRetryDelayMs
  const scheduler = options.scheduler ?? defaultScheduler

  function stateFor(key: string): KeyState<TSnapshot> {
    let entry = keys.get(key)
    if (!entry) {
      entry = { state: { ...CLEAN_STATE }, inFlight: null, pendingSnapshot: null, pendingWaiters: [], listeners: new Set() }
      keys.set(key, entry)
    }
    return entry
  }

  function setState(entry: KeyState<TSnapshot>, next: SaveState) {
    entry.state = next
    entry.listeners.forEach((listener) => listener(next))
  }

  function wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      scheduler(resolve, delayMs)
    })
  }

  // Runs `persist(snapshot)`, auto-retrying on failure up to `maxRetries`
  // times with jittered backoff, then — once the retry cycle settles (either
  // success or exhausted retries) — picks up any snapshot that got coalesced
  // in while this was running. `entry.inFlight` stays pointed at this whole
  // async function for its entire lifetime, so `idle()` blocks across the
  // full retry cycle, not just the first attempt.
  function runPersist(key: string, snapshot: TSnapshot): Promise<SaveResult> {
    const entry = stateFor(key)

    const run = (async (): Promise<SaveResult> => {
      let result: SaveResult = { error: 'unreachable' }
      let attempt = 0
      // Bounded loop: at most `1 + maxRetries` iterations — never infinite.
      for (attempt = 1; attempt <= maxRetries + 1; attempt++) {
        setState(entry, { ...entry.state, pending: true, error: null, retrying: attempt > 1 })
        try {
          result = await persist(snapshot)
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) }
        }
        if (!result.error) break
        if (attempt > maxRetries) break // retry budget exhausted — surface persistently below
        await wait(retryDelayMs(attempt))
      }

      if (result.error) {
        setState(entry, { dirty: true, pending: false, error: result.error, retrying: false })
      } else {
        setState(entry, { dirty: false, pending: false, error: null, retrying: false })
      }

      // A snapshot arrived while this persist (including its retries) was
      // running — run it next, coalescing any snapshots that piled up
      // behind it into one call.
      if (entry.pendingSnapshot !== null) {
        const next = entry.pendingSnapshot
        const waiters = entry.pendingWaiters
        entry.pendingSnapshot = null
        entry.pendingWaiters = []
        const followUp = runPersist(key, next)
        entry.inFlight = followUp
        waiters.forEach((resolve) => followUp.then(resolve))
      } else {
        entry.inFlight = null
      }

      return result
    })()

    entry.inFlight = run
    return run
  }

  return {
    enqueue(key, snapshot) {
      const entry = stateFor(key)
      if (!entry.inFlight) {
        return runPersist(key, snapshot)
      }
      // Already saving this key (possibly mid retry-cycle) — coalesce:
      // overwrite whatever snapshot was queued (if any) with this newer one,
      // and wait for the follow-up run that will eventually process it.
      entry.pendingSnapshot = snapshot
      return new Promise((resolve) => {
        entry.pendingWaiters.push(resolve)
      })
    },
    markDirty(key) {
      const entry = stateFor(key)
      setState(entry, { ...entry.state, dirty: true })
    },
    async idle(key) {
      const entry = stateFor(key)
      // A resolving persist may chain a coalesced follow-up into inFlight
      // before it settles, so re-check until the slot is genuinely empty.
      while (entry.inFlight) {
        await entry.inFlight
      }
    },
    getState(key) {
      return stateFor(key).state
    },
    subscribe(key, listener) {
      const entry = stateFor(key)
      entry.listeners.add(listener)
      return () => entry.listeners.delete(listener)
    },
  }
}
