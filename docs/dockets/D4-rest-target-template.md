# D4 — PT-prescribed rest target per exercise

**Source:** Tile 6 (target-source decision) · **Wave:** 2 (with/after D5 — same rest
area; same owner recommended) · **Migration:** `routine_exercises.rest_seconds`

## Decision
Rest target resolves in priority order: **(1) PT prescription in the plan wins per
exercise; (2) else one global value invariant across exercises** (the existing
localStorage `wt.restTarget` stepper). NO per-exercise learned memory. This mirrors
how `tempo`/`ptTempo` already works. Distinct from `sets.rest_seconds` (logged
elapsed) — do not conflate.

## Migration (append to `docs/database.md`, do NOT run)
```sql
alter table routine_exercises add column rest_seconds integer;  -- PT-prescribed rest target, nullable
notify pgrst, 'reload schema';
```
(Named to parallel `tempo`; nullable = no prescription → global fallback.)

## Files
- `src/lib/dal.ts` — add `rest_seconds` to `RoutineExerciseRow` + the routine selects,
  graceful-degrade if missing (same pattern as `tempo`).
- `src/app/workouts/[id]/TemplateEditor.tsx` — a control for the PT to set/clear a
  per-exercise rest target (parallel to the existing tempo control).
- `src/app/workout/[id]/WorkoutLogger.tsx` — build a `ptRest` map from
  `initialTemplate.routine_exercises` (exactly like `ptTempo`), and when a rest timer
  starts for an exercise, use its prescribed target if present else `restTarget`.
  Pass the resolved target into `RestTimer` / the guide rest.

## Acceptance
- Exercise A prescribes 180s, B prescribes nothing → rest from A targets 180s; rest
  from B targets the global stepper; nudging the global stepper changes B not A.
- Column absent → falls back to global everywhere (degrades, no crash).
- `npx tsc --noEmit` clean; tests for the resolve-order (prescribed vs global).

## Conflicts
Touches the rest area of `WorkoutLogger.tsx` → **overlaps D5**. Do D5 first (or same
agent), then D4 rebased. Shares `docs/database.md`/`dal.ts` with D3 (different regions).
