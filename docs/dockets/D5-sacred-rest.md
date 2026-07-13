# D5 — A running rest timer is sacred

**Source:** Tile 6 (folds field notes #1, #2) · **Wave:** 2 (before D4) · **Migration:** none

## Decision
A running rest timer is never reset or re-pointed by an implicit action.
- Completing a set (via ✓ `toggleDone`, `handleAddSet`, `completeFromEdit`, or
  guided-stop `handleGuideDone`) starts rest **only if no timer is currently running**.
  If one is running, log the set and leave the timer completely untouched.
- A running rest stays attached to the set it was started for; elapsed logs to THAT
  set on Done. A set completed while a rest runs simply records no rest.
- Adding or deleting sets never touches a running rest.
- The **only** deliberate restart is the explicit "Start rest" button: it logs the
  current elapsed to its set, then starts a fresh timer from 0:00.
- Cardio completion still never starts rest (`startsRestOnComplete` unchanged).

## Change
Make `startRestFor` (`WorkoutLogger.tsx:186`) **start-only-if-idle**: if a timer is
already running (`restForSet !== null`), it is a no-op for the implicit callers. Give
the explicit "Start rest" button a separate path that force-restarts (log elapsed to
the current set, then start fresh). Today `startRestFor` unconditionally bumps
`restNonce` and remounts onto the newest set — that is the bug.

## Files
- `src/app/workout/[id]/WorkoutLogger.tsx` — `startRestFor` + its callers
  (`toggleDone` :411, `handleAddSet` :349, `completeFromEdit` :471, `handleGuideDone`
  :503/:532), and the explicit "Start rest" button (:1241).
- `src/lib/restTimer.ts` — only if a pure helper clarifies the idle/force logic.

## Acceptance
- Complete set 1 → rest starts; at ~0:45 complete set 2 → rest STILL ~0:45+, counting,
  not reset; Done logs 0:45+ to set 1; set 2 shows no rest.
- Start a rest; add a set, delete a different set → rest keeps running untouched.
- Explicit "Start rest" while a rest runs → old elapsed logged, fresh 0:00 timer.
- Guided-stop while a rest runs → running rest untouched (idle-gated).
- `npx tsc --noEmit` clean; add tests for idle-gate vs explicit force-restart.

## Conflicts
Central rest-area edit in `WorkoutLogger.tsx`. Precedes D4 (rest target) — same owner
ideal. Guided-stop caller overlaps **D9** — do D5 before D9.
