# ADR-0007: Wake lock is held for the whole active logging session, not per-timer

**Status:** Proposed
**Date:** 2026-07-09
**Source:** [Quality survey 2026-07-09](../quality-survey-2026-07-09.md) findings H5, L6
**Scenario:** [guided-tempo-rest](../scenarios/guided-tempo-rest.md), [rest-timer-between-sets](../scenarios/rest-timer-between-sets.md)

## Context
`useWakeLock` is invoked only inside the two full-screen timers — `DruhTimer.tsx:53`
and `ExerciseGuide.tsx:52`. The docked rest timer (the primary rest experience,
auto-started after every set and rendered in the sticky bar) and ordinary set entry
hold no lock. On default phone screen-timeout settings the display locks mid-rest, so
the user unlocks the phone between every set — the most common interruption in the
app's core loop. The guided-tempo-rest scenario states "the screen stays awake for the
whole timer" as an invariant, but nothing verifies acquisition or re-acquisition after
the tab is backgrounded (the browser releases wake locks on `visibilitychange`, and
`useWakeLock` must re-request).

## Decision
1. **Scope:** WorkoutLogger holds the wake lock at the top level for any non-completed
   workout, and for a completed workout while it is being edited (editing renders the
   full interactive session, timers included):
   `useWakeLock(workout.status !== 'completed' || isEditing)`. Per-timer locks in
   DruhTimer/ExerciseGuide become redundant and are removed (single owner, no
   double-acquire bookkeeping).
2. **Lifecycle contract for `useWakeLock`,** pinned by tests:
   - requests `navigator.wakeLock.request('screen')` when `active` becomes true;
   - re-requests on `visibilitychange` back to visible while `active`;
   - releases on `active` → false and on unmount;
   - degrades silently where the API is unavailable.

## Consequences
- **Positive:** the screen stays on for the entire gym session — docked rest included;
  one owner instead of three; the scenario invariant becomes testable (spy on a fake
  `navigator.wakeLock`).
- **Negative:** battery cost while the logger is open but idle. Accepted: a logging
  session is the app's whole purpose and is bounded (~an hour); users leave via
  Done/Back which drops the lock.
- **Note:** completed (read-only) workout views hold no lock.

## Alternatives considered
- **Lock only while a timer is running (`restForSet !== null || guiding`)** — rejected:
  still sleeps during set entry and between sets without a running timer; more state
  transitions means more release/re-acquire edges to get wrong.
- **User setting to toggle keep-awake** — deferred until someone asks; default-on
  matches every comparable gym app.
