# Behaviour Checklist

Run through this list manually after any change to routing, workout actions, data loading, or navigation.

---

## 1. Workout lifecycle

| # | Action | Expected result |
|---|--------|----------------|
| 1.1 | Tap "Start workout" on dashboard | Creates `in_progress` workout for today → navigates to `/workout/[id]` — logger shows empty set list |
| 1.2 | Tap "Start now" on a template | Creates `in_progress` workout, **no sets written to DB yet** → navigates to `/workout/[id]` — logger pre-loads template exercises into local state only |
| 1.3 | Tap "Save" in workout logger (first time) | Warning modal appears: "Progress won't be tracked" |
| 1.4 | Confirm "Save anyway" | Sets written to DB, status stays `in_progress`, stays on logger |
| 1.5 | Tap "Save" again (same session) | Saves immediately, no warning |
| 1.6 | Tap "Done" | Sets written to DB, status → `completed`, redirects to `/dashboard` |
| 1.7 | Tap "← Back" with no sets (in_progress) | Workout deleted, redirects to `/dashboard` |
| 1.8 | Tap "← Back" with sets (in_progress) | Abandon prompt appears |
| 1.9 | Confirm "Abandon" | Workout deleted, redirects to `/dashboard` |
| 1.10 | Tap "← Back" on a **completed** workout | Navigates to `/dashboard`, workout is **not** deleted |
| 1.11 | Navigate away from a completed workout | **No** browser "You may lose data" prompt |
| 1.12 | Navigate away from an in-progress workout with sets | Browser shows "You may lose data" prompt |

---

## 2. Set data sources — critical invariants

| # | Scenario | What loads |
|---|----------|-----------|
| 2.1 | Fresh workout (blank, no template) | Empty logger |
| 2.2 | Fresh workout from template (never saved) | Template exercises loaded into **local state only** — nothing in `sets` table yet |
| 2.3 | In-progress workout with saved sets | Loads from `sets` table in DB |
| 2.4 | Completed workout | Always loads from `sets` table — **never** falls back to template |
| 2.5 | Completed workout with empty `sets` table | Shows "No sets were logged." — does NOT show template exercises |
| 2.6 | Complete a workout → view it | Shows the data the user actually logged, not template targets |
| 2.7 | Template has weight=null; user completes without editing | Completed workout shows `—` for weight — correct, no regression |
| 2.8 | Template is updated after a workout was completed from it | Completed workout still shows the original logged sets, not the new template values |

---

## 3. Calendar

| # | Action | Expected result |
|---|--------|----------------|
| 3.1 | Open dashboard | Current month calendar shown, today highlighted with orange ring |
| 3.2 | Tap prev/next month arrow | Calendar navigates, URL updates to `?y=...&m=...` |
| 3.3 | Tap empty **past or today** cell | Sheet: "Log a workout", template picker, "Start workout" button |
| 3.4 | Select **no template** and tap "Start workout" | Creates `in_progress` blank workout for that date, navigates to logger |
| 3.5 | Select **a template** and tap "Start workout" | Navigates to template editor `/workouts/[id]?date=...` — **does not create workout yet** |
| 3.6 | Tap empty **future** cell | Sheet: "Schedule a workout", template picker, "Schedule" button |
| 3.7 | Select **no template** and tap "Schedule" | Creates `planned` blank workout, calendar refreshes, dot appears |
| 3.8 | Select **a template** and tap "Schedule" | Navigates to template editor `/workouts/[id]?date=...` — **does not create workout yet** |
| 3.9 | In template editor from calendar (past/today) — tap "Start now" | Saves template, creates `in_progress` workout for the calendar date, navigates to logger |
| 3.10 | In template editor from calendar (future) — tap "Schedule" | Saves template, creates `planned` workout for the calendar date, redirects to `/workouts` |
| 3.11 | Tap cell with **planned** workout | Sheet shows "Start now" and "Remove" |
| 3.12 | Tap "Start now" on planned workout **with template** | Navigates to template editor `/workouts/[id]?workoutId=...` to set weights first |
| 3.13 | Tap "Start now" on planned workout **without template** | Status → `in_progress` directly, navigates to logger |
| 3.14 | In template editor from planned workout — tap "Start now" | Saves template, transitions workout to `in_progress`, navigates to logger |
| 3.15 | Tap "Remove" on planned workout | Workout deleted, calendar refreshes |
| 3.16 | Tap cell with **in_progress** workout | Sheet shows "Continue" |
| 3.17 | Tap cell with **completed** workout | Sheet shows "View workout" |
| 3.18 | Tap "View workout" | Opens `/workout/[id]` — shows completed read-only summary from DB |
| 3.19 | Dot colours | Completed = emerald, In-progress = orange, Planned = gray |

---

## 4. Set display UI

| # | Scenario | Expected result |
|---|----------|----------------|
| 4.1 | View a set row (active workout) | Full-width row: set number, **Weight** label + value, **Reps** label + value, ✕ button |
| 4.2 | Tap a set row (active workout) | Row expands into edit mode: two labeled inputs (Weight kg / Reps) |
| 4.3 | Edit a set and tap elsewhere | Edit auto-saves to **local state** (not DB), row returns to display mode |
| 4.4 | Edit a set and press Enter | Same as tapping elsewhere — saves to local state |
| 4.5 | Tap ✕ while editing | Cancels edit, row reverts to previous values |
| 4.6 | View a set row (completed workout) | Same labeled row layout but no ✕ button and not tappable |
| 4.7 | Set with null weight | Displays `—` for weight |
| 4.8 | Set with null reps | Displays `—` for reps |

---

## 5. Exercise history chart

| # | Scenario | Expected result |
|---|----------|----------------|
| 5.1 | Open history tab in exercise info modal | Fetches last 90 days, renders dual-axis SVG chart |
| 5.2 | Chart with data | Orange solid line = weight (kg); zinc dashed line = max reps |
| 5.3 | Weight values | Labelled in orange directly beside the first and last orange dots |
| 5.4 | Reps values | Labelled in zinc directly beside the first and last grey dots |
| 5.5 | X-axis | First and last date shown at the bottom |
| 5.6 | No completed workouts | "No completed workouts with this exercise yet." message |
| 5.7 | Exactly 1 data point | Shows single values (weight + reps) + date text, no chart line |
| 5.8 | Exercise only has weight (no reps) | Only orange line shown; no dashed line or reps labels |
| 5.9 | Complete a workout with exercise X | X's history updates on next chart open |
| 5.10 | Save (not complete) a workout | History does **not** change |
| 5.11 | History tab on `/routines/[id]` exercise page | Same chart rendered, lazy-loaded when tab is selected |

---

## 6. Templates

| # | Action | Expected result |
|---|--------|----------------|
| 6.1 | Go to `/workouts` | Template list shown |
| 6.2 | Create template, tap "Save" | Template appears in list, redirects to `/workouts` |
| 6.3 | Open existing template | Editor pre-filled with saved exercises |
| 6.4 | Tap "Start now" on existing template (no `?date`) | Saves template, creates workout for today, navigates to logger |
| 6.5 | Tap "Start now" on new unsaved template | Creates template + workout in one step, navigates to logger |
| 6.6 | Delete template | Removed from list, redirects to `/workouts` |
| 6.7 | Open template via `/workouts/[uuid]` | Loads correctly — UUID never coerced to `Number` |
| 6.8 | Load template button inside logger | Replaces current local sets with template exercises; nothing written to DB |
| 6.9 | Open template with `?date=YYYY-MM-DD` (past/today) | Button reads "Start now" — creates workout for that date |
| 6.10 | Open template with `?date=YYYY-MM-DD` (future date) | Button reads "Schedule" — creates `planned` workout for that date, redirects to `/workouts` |
| 6.11 | Open template with `?workoutId=N` | Button reads "Start now" — saves template, transitions planned workout to `in_progress`, opens logger |

---

## 7. Last-session button

| # | Scenario | Expected result |
|---|----------|----------------|
| 7.1 | View exercise row in WorkoutLogger (active or completed) | Clock icon button appears next to the `i` button in the exercise header |
| 7.2 | View exercise row in TemplateEditor | Clock icon button appears next to the `i` button in the exercise card |
| 7.3 | Tap clock icon | Loading spinner shown in modal immediately |
| 7.4 | Data found | Modal shows exercise name, date of last completed workout, max weight (kg), max reps |
| 7.5 | No previous completed workouts | Modal shows "No completed workouts with this exercise yet." |
| 7.6 | Weight is null in last session | Displays `—` for weight |
| 7.7 | Reps is null in last session | Displays `—` for max reps |
| 7.8 | Tap outside modal or ✕ | Modal closes |
| 7.9 | Save (not complete) a workout | Last-session data does **not** update — only completed workouts count |

---

## 8. Navigation invariants

| # | Rule |
|---|------|
| 8.1 | Completing a workout always ends at `/dashboard` |
| 8.2 | Abandoning a workout always ends at `/dashboard` |
| 8.3 | Deleting a template always ends at `/workouts` |
| 8.4 | Completing a workout never deletes it |
| 8.5 | A `completed` workout is never deleted by the abandon flow |
| 8.6 | Scheduling (future + template) always ends at `/workouts` after going through the template editor |
| 8.7 | Navigating away from a **completed** workout never triggers a browser data-loss warning |

---

## Known gotchas to recheck after schema changes

- `routines.id` is **UUID** — never pass through `Number()`. Use `string | number` in DAL functions.
- `workouts.id` is integer — `Number(id)` in page params is safe.
- `workouts.status` defaults to `'in_progress'` — backfill needed if you want old rows counted as `completed`.
- Exercise history and last-session data only query `status = 'completed'` — saving progress never appears.
- Template sets are **never pre-populated into the `sets` table** when starting a workout. They live in WorkoutLogger client state only until the user saves/completes.
- `getWorkoutWithSets` returns `template_id` — used by the page to fetch `initialTemplate` only when the workout is in-progress and has no sets yet.
- The `beforeunload` guard is intentionally skipped for `status = 'completed'` workouts to avoid false browser warnings.
- `TemplateEditor` receives optional `date` and `workoutId` search params. `date > today` → "Schedule" mode (planned workout). `workoutId` → transition existing planned workout.
- When routing to the template editor from the calendar, the workout is **not created** until the user taps "Start now" / "Schedule" in the editor.
