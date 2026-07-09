// Per-key serialized save queue with dirty/pending/error tracking (ADR-0004
// §2/§4, ADR-0006 pure core). No React, no DB — WorkoutLogger owns a single
// instance and calls `enqueue(workoutId, snapshot)` from every persistence
// call site; this module owns all the ordering/coalescing/state logic so it
// is unit-testable without a browser (see .claude/test_save-queue.mjs).
//
// Why a queue at all (finding H1): every set action used to fire an
// unserialized save. Two rapid adds could race — call A's write landing
// after call B's — leaving a stale snapshot. Serializing per key makes that
// impossible; coalescing means a burst of edits collapses to one save of the
// final state instead of N sequential ones.

// `success` is `boolean` (not the literal `true`) because a 'use server'
// action's return value crosses the RSC boundary and loses literal narrowing.
export type SaveResult = { success?: boolean; error?: string }
export type PersistFn<TSnapshot> = (snapshot: TSnapshot) => Promise<SaveResult>

export type SaveState = {
  dirty: boolean
  pending: boolean
  error: string | null
}

const CLEAN_STATE: SaveState = { dirty: false, pending: false, error: null }

type KeyState<TSnapshot> = {
  state: SaveState
  // The in-flight persist promise for this key, if any — new enqueue() calls
  // chain after it rather than starting a second concurrent persist.
  inFlight: Promise<SaveResult> | null
  // The most recent snapshot requested while a persist was in flight, and
  // the callers waiting on it — coalesced into a single follow-up persist.
  pendingSnapshot: TSnapshot | null
  pendingWaiters: ((result: SaveResult) => void)[]
}

export type SaveQueue<TSnapshot> = {
  // Serializes `persist(snapshot)` per key; concurrent calls for the same key
  // coalesce to the latest snapshot. Resolves with the result of whichever
  // persist call actually wrote the caller's snapshot (or a later one that
  // superseded it).
  enqueue(key: string, snapshot: TSnapshot): Promise<SaveResult>
  // Marks a key dirty without persisting — for local-only edits/deletes
  // (checklist §15.6/§15.7) that need the "unsaved changes" indicator to
  // light up before the next save clears it.
  markDirty(key: string): void
  getState(key: string): SaveState
  // Resolves once no persist is in flight or queued for this key. Used by
  // the completeWorkout path so the terminal save cannot overlap an autosave
  // (ADR-0004 §2 — overlapping snapshot saves must be impossible).
  idle(key: string): Promise<void>
}

export function createSaveQueue<TSnapshot>(persist: PersistFn<TSnapshot>): SaveQueue<TSnapshot> {
  const keys = new Map<string, KeyState<TSnapshot>>()

  function stateFor(key: string): KeyState<TSnapshot> {
    let entry = keys.get(key)
    if (!entry) {
      entry = { state: { ...CLEAN_STATE }, inFlight: null, pendingSnapshot: null, pendingWaiters: [] }
      keys.set(key, entry)
    }
    return entry
  }

  function runPersist(key: string, snapshot: TSnapshot): Promise<SaveResult> {
    const entry = stateFor(key)
    entry.state = { ...entry.state, pending: true }

    const run = (async (): Promise<SaveResult> => {
      let result: SaveResult
      try {
        result = await persist(snapshot)
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) }
      }

      if (result.error) {
        entry.state = { dirty: true, pending: false, error: result.error }
      } else {
        entry.state = { dirty: false, pending: false, error: null }
      }

      // A snapshot arrived while this persist was running — run it next,
      // coalescing any snapshots that piled up behind it into one call.
      if (entry.pendingSnapshot !== null) {
        const next = entry.pendingSnapshot
        const waiters = entry.pendingWaiters
        entry.pendingSnapshot = null
        entry.pendingWaiters = []
        const followUp = runPersist(key, next)
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
      // Already saving this key — coalesce: overwrite whatever snapshot was
      // queued (if any) with this newer one, and wait for the follow-up run
      // that will eventually process it.
      entry.pendingSnapshot = snapshot
      return new Promise((resolve) => {
        entry.pendingWaiters.push(resolve)
      })
    },
    markDirty(key) {
      const entry = stateFor(key)
      entry.state = { ...entry.state, dirty: true }
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
  }
}
