# D8 — Lossless clipboard + safe paste/import

**Source:** Tiles 4, 13 · **Wave:** 3 · **Migration:** none

## Decisions
### Tile 4 — Copy is lossless + per-set; Paste never silently wipes
- Copy captures the EXACT per-set list (every exercise, every set's own weight/reps,
  order) — identical on active / completed / editing views. No flattening.
- The clipboard model must carry per-set numbers, not `{ exerciseId, setCount, reps,
  weight }`. Replace with e.g. `entries: { exerciseId, exerciseName, sets: { weight,
  reps }[] }[]`; `applyPaste` rebuilds from that list.
- Paste target rule: empty workout → paste directly; non-empty → prompt **Overwrite /
  Append / cancel**. Wiping is never the silent default.

### Tile 13 — Import matches Paste
`handleImportTemplate` (:699) currently silently replaces the whole set list. Route it
through the SAME non-empty prompt (Overwrite / Append / cancel), reusing the paste
prompt component; empty → import directly; Append expands the template after existing
sets.

## Files
- `src/app/workout/[id]/WorkoutClipboardContext.tsx` — new per-set clipboard type.
- `src/app/workout/[id]/WorkoutLogger.tsx` — `handleCopy` (:818), `applyPaste`/
  `handlePasteRequest` (:788/:796), `handleImportTemplate` (:699), the shared
  Overwrite/Append/cancel prompt, and its Append path.
- `src/app/workouts/PasteTemplateButton.tsx` — consumes the same clipboard; update in
  lockstep so it still reads the new shape.

## Acceptance
- Log 60×10, 60×8, 50×6; Copy; paste into an empty workout → all three distinct sets
  (NOT three identical).
- Copy from a completed workout, paste into an active empty one → identical.
- Paste into a workout with a warm-up set → prompt; Append keeps warm-up + adds after;
  Overwrite replaces.
- Load template into a non-empty workout → same Overwrite/Append/cancel prompt; empty
  workout imports with no prompt.
- `PasteTemplateButton` still works.
- `npx tsc --noEmit` clean; tests for per-set round-trip + append vs overwrite.

## Conflicts
`WorkoutClipboardContext` + `PasteTemplateButton` are isolated. The `WorkoutLogger`
edits are a distinct region (copy/paste/import) from D5/D6/D7 — sequence to be safe.
