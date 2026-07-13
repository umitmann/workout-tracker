# D9 — Guided guides: rep-confirm, ordering, Exit bug

**Source:** Tiles 11, 12 · **Wave:** 4 (after D5) · **Migration:** none

## Decisions
### Tile 11 — single-set Stop & log confirms reps
On early Stop & log, surface the computed `stopEarlyReps` as an **editable** value; the
user adjusts ± and saves. Adjusting to 0 logs nothing (existing ≤0 rule). Natural
goal-completion may log the goal directly without the confirm (see OPEN-QUESTIONS).
After confirm: log + idle-gated `startRestFor` (D5).

### Tile 12a — weight-first ordering
Both guide setups order Reps→Weight; flip to **Weight→Reps** to match the rest of the
app: single-set guided setup (:1807-1822), guide-all rows (:1931-1932), and the
`ExerciseGuide` GET READY readout (:207 → "{weight}kg × {reps}").

### Tile 12b — Exit must never lose an exercise (CONFIRMED bug)
Repro: play ▶All, tap **Exit** back to the logging screen → the first exercise's sets
are gone / not logged. Root-cause the `finish → onDone → handleGuideDone` (:624) path —
suspected stale `localSets` snapshot captured at guide mount clobbering newer state.
Invariant: exiting by any path preserves every exercise and every set; completed sets
logged, uncompleted sets unchanged.

### Rep confirm for guide-all (batched)
Don't interrupt each set — show a single **end-of-guide review** of per-set reps
(editable) before committing, so the set→rest→set flow stays hands-free.

## Files
- `src/app/workout/[id]/DruhTimer.tsx` — single-set Stop & log → hand back a
  confirmable rep count.
- `src/app/workout/[id]/ExerciseGuide.tsx` — GET READY ordering; results handoff.
- `src/app/workout/[id]/WorkoutLogger.tsx` — `handleGuidedStop` (:488) confirm step;
  both setup sheets' ordering; `handleGuideDone` (:624) stale-snapshot fix;
  end-of-guide review UI.

## Acceptance
- 10-rep guided set, pause, Stop & log at ~6 → confirm shows 6 → bump to 5 → logs 5.
- Both guide setups read Weight then Reps.
- Workout A(first)/B/C; ▶All on B; Exit → A, B, C all present, B's done sets logged
  (bug repro must pass).
- 3-set guide to completion → end-of-guide review lists 3 counts → adjust one → logged
  reps reflect it.
- Guided-stop with a rest already running → running rest untouched (D5).
- `npx tsc --noEmit` clean; tests for stopEarly confirm + handleGuideDone preservation.

## Conflicts
Depends on **D5** (idle-gated rest on guided-stop). Guided handlers overlap D7's
set-list writes lightly — rebase after D7. Do before D10.
