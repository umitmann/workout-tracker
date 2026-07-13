# D6 — Autosave auto-retry + block Complete on unsaved

**Source:** Tile 5 · **Wave:** 2 (after D5) · **Migration:** none

## Decisions
1. **Auto-retry:** on a failed autosave, retry automatically up to **3 times with
   jittered backoff**, no user action. If all 3 fail, surface a **persistent**
   "couldn't save yet" notice + manual Retry (not a transient toast); the
   `beforeunload` guard stays armed. Bounded → no infinite loop.
2. **Block Complete on unsaved:** Complete/Done is disabled / refuses while the queue
   is `dirty` or `error`. It may only proceed once the latest snapshot has persisted.
   Today `handleComplete` waits for `idle()` — but a failed save is idle-with-error,
   so Complete can currently fire over unsaved data. Fix that.
3. A previously failed save that later succeeds (auto-retry or manual) clears the
   notice and re-enables Complete.

## Preserve
ADR-0004: every persist goes through the queue and inspects its result; Done must
never navigate away over a failed final save (`completeWorkout` already surfaces
errors — keep that).

## Files
- `src/lib/saveQueue.ts` — bounded jittered auto-retry on transport failure; expose
  enough state (dirty/pending/error/retrying) for the UI.
- `src/app/workout/[id]/WorkoutLogger.tsx` — `handleComplete` (:767) gate on
  dirty/error (not just idle); the save-state strip (:1193-1208) shows the persistent
  notice + Retry; Done disabled while dirty/error.

## Acceptance
- Log a set offline → auto-retries; restore network within 3 attempts → clears to
  saved, no user action.
- Keep offline through all 3 attempts → persistent "couldn't save yet" + Retry.
- With that notice showing, tap Done → refused/disabled; restore + Retry succeeds →
  notice clears, Done works.
- `npx tsc --noEmit` clean; saveQueue tests for retry count/backoff bound + gating.

## Conflicts
`saveQueue.ts` is isolated; the `WorkoutLogger` edits (`handleComplete`, save strip)
are a distinct region from D5/D7. Sequence within Wave 2/3; low overlap.
