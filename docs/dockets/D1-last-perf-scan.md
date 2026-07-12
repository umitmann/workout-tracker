# D1 — Last-session scan should not miss rotated exercises

**Source:** Tile 7 (latent issue) · **Wave:** 1 (parallel with D2) · **Migration:** none

## Problem
`getLastExercisePerformance` (`src/lib/dal.ts:288`) only scans the **50 most recent
completed workouts** (`.order('date', desc).limit(50)`), then finds the first of
those containing the exercise. An exercise not trained within those 50 sessions
returns `null`, so both the ◷ Last modal and the inline "Last:" line go blank even
though older history exists — while all-time 🏆 Best (`getBestExercisePerformance`,
no limit) still resolves, so the two disagree.

## Change
Make "last session for this exercise" a query keyed by `exercise_id`, not a fixed
workout window:
1. Query `sets` filtered by `exercise_id` (+ user's completed workouts) to find the
   most recent completed workout that actually contains the exercise, rather than
   pre-slicing to 50 workouts and hoping the exercise is in them.
2. Preserve the current return shape (`LastExercisePerformance`: `{ date, sets[] }`)
   and set ordering (by `id` asc within the workout).
3. Keep it completed-only (`status = 'completed'`); the in-progress workout is never
   "last".

Prefer joining `sets → workouts` (or a two-step: latest workout_id for this exercise
among completed workouts, then that workout's sets) so there is no 50-row cap.

## Files
- `src/lib/dal.ts` — `getLastExercisePerformance` only. Do not change
  `getBestExercisePerformance`/`selectBestSession`.

## Acceptance
- given an exercise last trained 60+ completed workouts ago → ◷ Last and inline
  "Last:" both show that session (previously blank).
- Recently-trained exercises behave exactly as before.
- `LastExercisePerformance` shape unchanged; `LastPerfModal` renders without changes.
- `npx tsc --noEmit` clean; existing dal tests pass; add a test for the >50-workout
  gap if the test suite covers dal cores.

## Conflicts
None expected — single function, file-disjoint from all other dockets.
