# D7 — Never lose a typed value (auto-commit + prefill)

**Source:** Tiles 9, 10a, 8 · **Wave:** 3 (before D3) · **Migration:** none

## Decisions
### Tile 9 — auto-commit typed values as a not-done set
Tapping away from any weight/reps entry (add-set form OR inline editor) saves what was
typed as a set that is **kept but NOT marked done** — no ✓, no rest started. Nothing
typed is ever discarded; the user returns and taps ✓ to complete it.
- A fully-empty form/field commits nothing (no phantom empty sets).
- `saveEditSet` (:655) currently writes `null` for an emptied field, wiping the prior
  value — align it with `completeFromEdit` (:458): an emptied field falls back to the
  set's prior value, never nulls a previously-saved value.
- Editing an already-**done** set and tapping away keeps its typed value AND its done
  state. Auto-commit's "not-done" applies only to never-completed entries.
- An auto-committed not-done set does NOT start rest (only ✓/Complete does — see D5).

### Tile 10a — post-Add value retention
After `handleAddSet` (:346-353) succeeds, do NOT blank weight/reps — **re-seed from
the just-logged set** so straight sets are Add, Add, Add. (Kills "always goes back to
12.5".)

### Tile 8 — quick-add prefill fallback
`handleSelectExercise` (:308) currently prefills only from the current workout's last
set (blank on first use). Extend it to fall back to the **previous session's** last
set for that exercise (reuse `getLastExercisePerformance` / the `lastPerf` map), so the
form always seeds with last weight/reps.

## Files
- `src/app/workout/[id]/WorkoutLogger.tsx` — `handleAddSet`, `handleSelectExercise`,
  `saveEditSet`, the add-form flush-on-navigate/re-select, and the not-done commit path.
- `src/lib/setListOps.ts` — if a pure `commitPending`/`addNotDone` helper clarifies it.

## Acceptance
- Type 60×10 into the add form, tap another exercise's row → a not-done 60×10 set
  exists (dashed, no ✓); survives reload.
- Tap a done 60×10 set, change to 65, tap away without ✓ → row shows 65, still done.
- Tap a set, clear the weight, tap away → weight NOT nulled (prior kept).
- Add 60×10 → form still shows 60×10 → Add again → second 60×10 (no re-entry).
- Exercise untouched this session but done last week at 40×10 → tap + → prefilled 40×10.
- `npx tsc --noEmit` clean; tests for auto-commit, empty-guard, saveEditSet fallback.

## Conflicts
Depends on **D5** (must not start rest on auto-commit). Shares `LocalSet`/set-row with
**D3** → do D7 first, D3 rebased. Rebase on D2 (Stepper API) after Wave 1.
