# Logging-screen refactor — implementation dockets

Each docket is a self-contained unit of work derived from
[`../scenarios/logging-screen-inventory.md`](../scenarios/logging-screen-inventory.md).
The inventory holds the full given/when/then/invariant CONTRACT per tile; a docket
adds **files to touch**, **acceptance**, **DB migration** (if any), and
**conflict/dependency** notes so it can be handed to one agent cold.

## Ground rules (every docket)
- **DB migrations are applied BY HAND by the maintainer.** A docket that needs a
  schema change only (a) appends the SQL block to `docs/database.md` in the existing
  style (`alter table … ; notify pgrst, 'reload schema';`) and (b) makes the code
  **degrade gracefully** until the column/function exists (see the `rest_seconds` /
  `set_details` precedent + `isMissingColumnError`/`isMissingFunctionError` in
  `src/lib/dal.ts`). **Never run a migration.**
- New `sets` columns must also be threaded through the `save_workout_sets` RPC block
  in `docs/database.md` AND its client fallback (`saveSetSnapshot` in
  `src/app/actions/cores.ts`) and `SetPayload`/`toPayload`.
- Preserve existing ADRs (0004 atomic save, 0005 local date, 0007 wake-lock, 0008
  touch targets). Run `npx tsc --noEmit` and the test suite before finishing.
- Work on your own branch; do not push or touch `main`.

## The bottleneck
Almost every docket edits `src/app/workout/[id]/WorkoutLogger.tsx` (~2000 lines).
Parallel edits there conflict. Only D1 and D2 are file-disjoint enough to run
together; the `WorkoutLogger`-heavy dockets are **sequenced**, each rebasing on the
previous merge.

## Dockets

| # | Docket | Source tiles | Primary files | Migration | Wave |
|---|--------|-------------|---------------|-----------|------|
| D1 | [last-perf-scan](D1-last-perf-scan.md) | 7 | `lib/dal.ts` | — | **1 (parallel)** |
| D2 | [stepper-numpad](D2-stepper-numpad.md) | 10b | `Stepper.tsx`, new `Numpad.tsx`, `numericInput.ts` | — | **1 (parallel)** |
| D3 | [difficulty-rating](D3-difficulty-rating.md) | 10c | `database.md`, `dal.ts`, `cores.ts`, set-row | `sets.difficulty` | 3 |
| D4 | [rest-target-template](D4-rest-target-template.md) | 6 | `database.md`, `dal.ts`, `TemplateEditor.tsx`, WorkoutLogger | `routine_exercises.rest_seconds` | 2 |
| D5 | [sacred-rest](D5-sacred-rest.md) | 6 | WorkoutLogger `startRestFor` + callers | — | 2 |
| D6 | [save-queue-retry-gating](D6-save-queue-retry-gating.md) | 5 | `saveQueue.ts`, WorkoutLogger | — | 2 |
| D7 | [set-entry-integrity](D7-set-entry-integrity.md) | 9, 10a, 8 | WorkoutLogger add/edit/select, `setListOps.ts` | — | 3 |
| D8 | [clipboard-perset-import](D8-clipboard-perset-import.md) | 4, 13 | `WorkoutClipboardContext.tsx`, WorkoutLogger, `PasteTemplateButton.tsx` | — | 3 |
| D9 | [guided-guides](D9-guided-guides.md) | 11, 12 | `DruhTimer.tsx`, `ExerciseGuide.tsx`, WorkoutLogger | — | 4 |
| D10 | [nav-edit-completed](D10-nav-edit-completed.md) | 1, 15 | WorkoutLogger `handleBack`/`isEditing` | — | 4 |

## Wave plan (conflict-aware)
- **Wave 1 — parallel now:** D1 (dal only) ‖ D2 (Stepper only). Disjoint files.
- **Wave 2 — rest + save:** D5 → D4 (both touch the rest area; same owner), then D6.
- **Wave 3 — set data model:** D7 → D3 (both touch `LocalSet`/set-row) ‖ D8 (clipboard;
  mostly separate region — sequence if it collides).
- **Wave 4 — guides + nav:** D9, then D10.

Each `WorkoutLogger`-heavy docket **branches from the latest `main` after the prior
wave merges** and rebases before integration.

## Deferred / not a docket
- Tile 3 (distance-unit toggle / cardio set-row) — not interviewed; no docket yet.
