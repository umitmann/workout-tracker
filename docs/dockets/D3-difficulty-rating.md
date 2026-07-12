# D3 — Per-set difficulty rating (1-5 chip)

**Source:** Tile 10c (NEW feature) · **Wave:** 3 (after/with D7 — shares `LocalSet`
+ set-row) · **Migration:** `sets.difficulty` (tracked, applied by hand)

## Decisions
- Always-visible **1-5 chip on each non-cardio set row**, tappable anytime, blank
  until set, editable after the fact. No prompt, never blocks add/complete/Done.
- Scale **1 = easy … 5 = maximal** (see OPEN-QUESTIONS — confirm before shipping the
  labels; the storage is scale-agnostic so this is a UI-label decision only).
- Optional/nullable everywhere.

## Migration (append to `docs/database.md`, do NOT run)
```sql
alter table sets add column difficulty smallint;   -- 1-5 subjective effort, nullable
notify pgrst, 'reload schema';
```
Also update the `save_workout_sets` RPC block in `docs/database.md` to insert
`difficulty`, and mirror it in the client fallback.

## Graceful degrade (precedent: `rest_seconds`)
- `src/lib/dal.ts` — add `difficulty` to set selects behind the same
  `isMissingColumnError('difficulty')` fallback pattern; extend the fetched set types.
- `src/app/actions/cores.ts` — `saveSetSnapshot` fallback insert + the RPC payload
  must include `difficulty`, degrading if the column is missing.
- `SetPayload` / `toPayload` / `LocalSet` — carry `difficulty: number | null`.

## UI
- `src/app/workout/[id]/WorkoutLogger.tsx` — render the 1-5 chip on each non-cardio
  set row (active + editing), and read-only in the completed view. Persist on tap
  (same path as other set edits; a plain value change → markDirty/persist).

## Acceptance
- Each strength set row shows a blank 1-5 chip; tap 4 → persists; reload → still 4.
- Cardio rows show no chip.
- Completing a workout with some chips blank is allowed; chips render read-only in the
  completed view.
- With the column absent, the app still loads/saves (degrades), no crash.
- `npx tsc --noEmit` clean; tests for the graceful-degrade path.

## Conflicts
Edits `LocalSet` + the set-row render → **collides with D7**. Sequence after D7 and
rebase. Shares `docs/database.md` + `dal.ts`/`cores.ts` with D4 (different regions).
