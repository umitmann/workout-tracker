# Feature Plan: Monthly Calendar & Exercise History

## Overview

Two connected features:

1. **Monthly Calendar** — replace the flat workout-template list on `/workouts` with a calendar view. Each day shows any workout scheduled or completed. Users can log a workout in hindsight (past day) or schedule one for a future day.
2. **Exercise History Graphs** — per-exercise progress charts fed only by *completed* workouts. The workout logger gains two separate save actions with a clear distinction between "save progress" and "complete workout".

---

## 1. Required Database Changes

### 1a. `workouts` table — add `status` and `template_id`

```sql
-- Workout lifecycle state
ALTER TABLE workouts
  ADD COLUMN status text NOT NULL DEFAULT 'in_progress'
  CHECK (status IN ('planned', 'in_progress', 'completed'));

-- Optional: which template a planned workout was scheduled from
-- Nullable — blank workouts have no template
ALTER TABLE workouts
  ADD COLUMN template_id bigint REFERENCES routines(id) ON DELETE SET NULL;
```

| status | meaning |
|---|---|
| `planned` | Scheduled for a future (or past) date; not yet started |
| `in_progress` | Logger has been opened; sets may exist |
| `completed` | User pressed "Complete workout"; exercise history counts this |

> **Migration note:** existing rows will receive `status = 'in_progress'` by default, which is correct — they were started but never explicitly completed. You may want to backfill old workouts as `completed` if they have sets.

### 1b. No new table for exercise history

Exercise history is derived on the fly by joining `sets` → `workouts` and filtering `workouts.status = 'completed'`. No extra table is needed for now.

---

## 2. Calendar View (`/workouts`)

### Behaviour

- Default view: current month as a 7-column grid (Mon–Sun).
- Each day cell shows a pill/dot if a workout exists on that date.
- Tapping a **past or today** empty cell → modal/sheet: "Log workout for [date]" — pick a template or start blank → creates a `planned` workout for that date then immediately opens logger (sets status to `in_progress`).
- Tapping a **future** empty cell → modal: "Schedule workout for [date]" — pick a template → creates a `planned` workout for that date (does **not** open logger).
- Tapping a day with a **planned** workout → options: "Start now" (opens logger) or "Remove".
- Tapping a day with an **in_progress** or **completed** workout → opens logger or summary.
- Previous/next month navigation arrows.

### New routes / components

| Path | Purpose |
|---|---|
| `/workouts` | Replaced with `CalendarView` server component |
| (modal/sheet, no new route) | Day-tap sheet for scheduling |

### New DAL functions

```ts
getMonthWorkouts(year: number, month: number): Promise<WorkoutCalendarEntry[]>
// Returns all workouts for the user in the given month.
// WorkoutCalendarEntry: { id, date, status, template_id, set_count }

scheduleWorkout(date: string, templateId?: string | number): Promise<{ id }>
// Inserts a 'planned' workout for the given date (ISO YYYY-MM-DD).
// Does not pre-populate sets — sets are added when started.

startPlannedWorkout(workoutId): void (server action, redirects)
// Sets status to 'in_progress', redirects to /workout/[id].
// Does NOT pre-populate sets in the DB — template exercises are loaded into
// WorkoutLogger client state only; nothing is written to `sets` until Save/Done.
```

---

## 3. Workout Logger Changes

### Two save buttons

Replace the single "Finish" button with:

| Button | Action | Status after |
|---|---|---|
| **Save progress** | Persists current sets, stays on page | `in_progress` |
| **Complete workout** | Persists sets, marks complete, goes to dashboard | `completed` |

#### "Save progress" confirmation prompt

Before saving progress, show an inline prompt (not a full modal — just a banner):

> **Progress will not be counted in exercise history.**
> Sets are saved but this workout is not marked complete. Tap "Complete workout" when you're done.

The prompt appears once per session the first time the user taps "Save progress". After confirming, it saves without further interruption.

### Abandon vs Save

Current "abandon" deletes the workout. That should remain unchanged — abandoning a `planned` workout resets it to `planned` (does not delete) so it stays on the calendar. Abandoning an `in_progress` workout still deletes it.

### New server actions (replaces `finishWorkout`)

```ts
saveWorkoutProgress(workoutId, sets: SetPayload[]): Promise<void>
// Replaces sets, sets status = 'in_progress'. No redirect.

completeWorkout(workoutId, sets: SetPayload[]): Promise<void>
// Replaces sets, sets status = 'completed', revalidates, redirects to dashboard.
```

`finishWorkout` can be removed once these are in place.

---

## 4. Exercise History Graphs (`/exercises/[id]` or inline)

### Data shape

```ts
type ExerciseHistoryPoint = {
  date: string           // YYYY-MM-DD
  maxWeight: number | null
  maxReps: number | null // max reps logged for any set of this exercise that day
  totalVolume: number | null  // sum(weight * reps) across all sets that day
  setCount: number
}
```

### DAL function

```ts
getExerciseHistory(exerciseId: number, limitDays = 90): Promise<ExerciseHistoryPoint[]>
// Joins sets → workouts WHERE workouts.status = 'completed'
// Groups by date, returns sorted ascending
```

### UI

- Custom SVG chart (no third-party charting library).
- Accessible via:
  - The exercise info modal inside the workout logger (`/workout/[id]`)
  - The exercise detail page (`/routines/[id]`)
- **Dual-axis overlay**: weight (orange solid line, left scale) and max reps (zinc dashed line, right scale) are drawn on independent Y-axes so they both use the full chart height regardless of their value ranges.
- Labels are attached directly to the first and last dot of each series (not fixed to axis positions) to avoid ambiguity when lines cross.
- Only shows data points from completed workouts — labelled "Last 90 days · completed workouts only".
- History tab is **lazy-loaded**: data is fetched on first tab selection, not on modal open.

---

## 5. Implementation Order

1. **Run the SQL migrations** (section 1a) in Supabase dashboard or via migration file.
2. Replace `finishWorkout` with `saveWorkoutProgress` + `completeWorkout` in the logger.
3. Build the calendar view on `/workouts`.
4. Add scheduling / hindsight-logging flows.
5. Build exercise history query + chart component.
