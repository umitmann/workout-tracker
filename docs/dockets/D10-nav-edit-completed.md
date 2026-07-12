# D10 — Back button + editing a completed workout

**Source:** Tiles 1, 15 · **Wave:** 4 (last) · **Migration:** none

## Decisions
### Tile 1 — Back never loses a session
- Active workout with ≥1 set, Back → a sheet with exactly **Save & leave** and
  **Delete workout**. Drop all "abandon"/"your sets will not be saved" wording.
- Save & leave → flush any pending autosave, navigate to dashboard; workout stays
  `in_progress`, fully resumable.
- Delete workout → a **second** "Are you sure?" step → `deleteWorkout` removes the
  entry, navigate to dashboard.
- Active workout with **no** sets, Back → straight to dashboard, no sheet.
- Invariant: an active workout is never lost by navigating away; only the explicit
  two-step Delete destroys data.

### Tile 15 — editing a completed workout: snapshot + revertable discard
- Entering Edit (`setIsEditing(true)` :998) captures a **pre-edit snapshot** of the sets.
- Changes autosave live (never lose data mid-edit).
- **Done/Save edits** keeps the changes and re-completes; the original **date + completed
  status are preserved** (`completeWorkoutCore` already only flips status — keep that).
- **Back → Discard** restores the captured snapshot (reverting all edits, including
  already-autosaved ones) and returns to the read-only completed view.
- Header should read "Editing" (not "Active") while editing a completed workout.

## Files
- `src/app/workout/[id]/WorkoutLogger.tsx` — `handleBack` (:708) + the abandon prompt
  (:1759 area) → Save & leave / two-step Delete; `isEditing` snapshot on entry; the
  discard-edits prompt (:1724-1748) restore-and-persist; the header label.
- `src/app/actions/workouts.ts` — `deleteWorkout` already exists (:99); wire it.

## Acceptance
- Active workout, 2 sets, Back → sheet: Save & leave + Delete. Save & leave → dashboard;
  reopen → both sets present. Delete → "Are you sure?" → confirm → dashboard; entry gone.
- Active workout, no sets, Back → dashboard, no sheet.
- No copy anywhere says "abandon"/"sets will not be saved".
- Edit a completed workout dated last week → change a weight → Done → still last week,
  still completed, new weight saved.
- Edit → add a set, tick another → Back → Discard → changes gone, matches pre-edit.
- Header reads "Editing" during edit.
- `npx tsc --noEmit` clean; tests for the snapshot/discard restore.

## Conflicts
`handleBack`/`isEditing`/header are a distinct region, but this is the LAST
WorkoutLogger docket — rebase on everything merged before it.
