# ADR-0004: Workout set persistence — atomic writes, serialized saves, surfaced failures

**Status:** Proposed
**Date:** 2026-07-09
**Source:** [Quality survey 2026-07-09](../quality-survey-2026-07-09.md) findings C1, C2, H1, M8
**Scenario:** [workout-autosave-on-add](../scenarios/workout-autosave-on-add.md), [workout-unsaved-indicator](../scenarios/workout-unsaved-indicator.md)

## Context
`saveWorkoutProgress` persists the set list as an unconditional
`delete().eq('workout_id', …)` followed by an insert of the full snapshot
(`src/app/actions/workouts.ts:173-174`). Neither step is transactional and neither
result is checked; `insertSets` swallows any error that isn't a missing-column error.
The client fires this via `persist()` inside `startTransition` on every set action,
with no serialization and the return value discarded
(`WorkoutLogger.tsx:362-366`).

Two concrete failure modes follow, both on the exact flaky-gym-network path the
autosave feature exists to protect:

1. **Wipe:** delete succeeds, insert fails → the workout's DB copy is empty. A
   reload/crash now loads an empty workout.
2. **Race:** two rapid adds fire overlapping delete+insert cycles; call A's insert can
   land after call B's delete, leaving a stale or partial snapshot (violates
   behaviour-checklist §15.3).

In both cases the UI shows nothing — no error, no retry, no unsaved indicator.

## Decision
1. **Atomicity:** a save must never leave the DB emptier than before on failure. The
   delete+insert pair moves into a single Postgres function (Supabase RPC) executed as
   one transaction. (Insert-new-then-delete-old was considered; a transaction is
   simpler and also fixes the race window.)
2. **Serialization:** the client serializes saves per workout through a promise queue
   (chain on a ref). A new save waits for the in-flight one; intermediate snapshots may
   be coalesced to latest-wins. Overlapping delete+insert cycles must be impossible.
3. **Surfaced failures:** every persistence call site inspects the action result. On
   `{error}` the logger sets a visible, `aria-live`-announced "not saved" state, keeps
   the `beforeunload` guard armed, and offers retry. "Done" must not redirect to the
   dashboard while the final save has failed.
4. **Dirty tracking:** inline edits and deletes (local-only per §15.6/§15.7) set a
   dirty flag that renders a persistent "Unsaved changes" indicator, distinct from the
   autosaved add path, cleared only by a successful persist.

## Consequences
- **Positive:** the app's core promise ("never loses a set unexpectedly") becomes
  enforceable and testable; checklist §15.1-15.3 gain automated coverage.
- **Negative:** requires a SQL migration (the RPC) and touches every persistence call
  site in WorkoutLogger; the save queue adds client state.
- **Testing:** the queue and dirty-tracking logic must live in a pure module
  (see [ADR-0006](0006-pure-core-extraction-testing-strategy.md)) so node:test can
  cover ordering and failure paths without a browser.

## Alternatives considered
- **Diff-based upsert (only write changed rows)** — rejected for now: requires stable
  server-side set identity for locally created rows; the full-snapshot RPC keeps the
  current mental model ("DB mirrors local state after save") intact.
- **Debounce-only, keep delete+insert** — rejected: shrinks but does not close the
  wipe window, and still loses the failed-save signal.
- **Client-side retry loop without surfacing** — rejected: retries help transient
  blips but the user must know when persistence is failing before they leave the gym.
