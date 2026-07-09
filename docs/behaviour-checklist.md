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
| 1.10 | Tap "← Back" on a **completed** workout (read-only view) | Navigates to `/dashboard`, workout is **not** deleted |
| 1.11 | Navigate away from a completed workout | **No** browser "You may lose data" prompt |
| 1.12 | Navigate away from an in-progress workout with sets | Browser shows "You may lose data" prompt |
| 1.13 | Tap "Edit" on a completed workout | Switches to editable mode — **no DB write**, status stays `completed` |
| 1.14 | Tap "← Back" while editing a completed workout | "Discard changes?" prompt appears — "Keep editing" cancels, "Discard" returns to read-only view with no DB changes |
| 1.15 | Tap "Done" while editing a completed workout | Saves new sets, status remains `completed`, redirects to `/dashboard` |

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
| 3.3 | Tap empty **past or today** cell | Sheet opens immediately with template list already populated (no loading spinner) — shows "Log a workout", template picker, "Start workout" button |
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
| 3.15 | Tap "Remove" on planned workout | Buttons replace with **Confirm** (red filled) + **Cancel** |
| 3.16 | Tap "Confirm" after Remove prompt | Workout deleted, calendar refreshes |
| 3.17 | Tap "Cancel" after Remove prompt | Prompt dismissed, workout unchanged |
| 3.18 | Tap cell with **in_progress** workout | Sheet shows "Continue" and "Delete" |
| 3.19 | Tap "Delete" on in_progress / completed workout | Confirm + Cancel buttons appear |
| 3.20 | Tap "Confirm" after Delete prompt | Workout soft-deleted, calendar refreshes |
| 3.21 | Tap "Cancel" after Delete prompt | Prompt dismissed, workout unchanged |
| 3.22 | Tap cell with **completed** workout | Sheet shows "View workout" and "Delete" |
| 3.23 | Tap "View workout" | Opens `/workout/[id]` — shows completed read-only summary from DB |
| 3.24 | Dot colours | Completed = emerald, In-progress = orange, Planned = gray |

---

## 4. Set display UI

| # | Scenario | Expected result |
|---|----------|----------------|
| 4.1 | View a set row (active workout) | Full-width row: set number, **Weight** label + value, **Reps** label + value, ✕ button (44×44 min hit area, ADR-0008) |
| 4.1a | Tap the row's delete ✕ once | Confirm/Cancel buttons replace the row's action area in place (two-tap pattern, mirrors §3.15–3.17); set is **not yet** removed |
| 4.1b | Tap Confirm after the delete ✕ | Set removed from local state (§15.7: not autosaved — persists on next Save/Done); marks the queue dirty |
| 4.1c | Tap Cancel after the delete ✕ | Prompt dismissed, set unchanged |
| 4.2 | Tap a set row (active workout) | Row expands into edit mode: two labeled inputs (Weight kg / Reps) |
| 4.3 | Edit a set and tap elsewhere | Edit auto-saves to **local state** (not DB), row returns to display mode |
| 4.4 | Edit a set and press Enter | Same as tapping elsewhere — saves to local state |
| 4.5 | Tap ✕ while editing | Cancels edit, row reverts to previous values (this is the edit-mode cancel ✕, distinct from the delete ✕ in 4.1a — no confirm step, nothing destructive happens) |
| 4.6 | View a set row (completed workout) | Same labeled row layout but no ✕ button and not tappable |
| 4.7 | Set with null weight | Displays `—` for weight |
| 4.8 | Set with null reps | Displays `—` for reps |
| 4.9 | Add exercises one by one in workout logger | Exercises appear in the order added — **not** alphabetically |
| 4.10 | Add exercises one by one in template editor | Same — insertion order preserved |
| 4.11 | Workout or template with 2+ exercises | ↑ / ↓ buttons visible on each exercise header; first item's ↑ and last item's ↓ are disabled |
| 4.12 | Tap ↑ on an exercise | Exercise moves up one position (all its sets move with it) |
| 4.13 | Tap ↓ on an exercise | Exercise moves down one position |
| 4.14 | Single exercise in workout or template | No ↑ / ↓ buttons shown |

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
| 5.12 | Chart data labels / axis text at mobile width (WP-16) | Value labels and axis dates render at >= 11 SVG-user-unit font size (legible, not the old 8-9px) |
| 5.13 | Reps line/labels in dark mode (WP-16) | Renders in zinc-400 (not zinc-500) — zinc-500 fails WCAG AA against the dark panel background |
| 5.14 | Screen reader on the chart `<svg>` (WP-16) | `role="img"` with a `<title>`/`<desc>` (referenced via `aria-labelledby`) summarizing the date range and first/last weight/reps values |

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

## 7. Performance history buttons

Three icon buttons appear next to the `i` (info) button on every exercise row, in both WorkoutLogger (active and completed views) and TemplateEditor.

| Icon | Tooltip | Query |
|---|---|---|
| Clock | Last session | Most recent completed workout containing this exercise |
| Trophy | Best session | Completed workout with the single highest-weight set ever |
| Bolt | Best · 60 days | Same as trophy, limited to the last 60 calendar days |

| # | Scenario | Expected result |
|---|----------|----------------|
| 7.1 | View exercise row in WorkoutLogger (active or completed) | Clock, trophy, and bolt icon buttons appear next to `i` in the exercise header |
| 7.2 | View exercise row in TemplateEditor | Same three buttons appear next to `i` in the exercise card |
| 7.3 | Tap any icon button | Modal opens immediately with a loading spinner; modal title matches the button tapped |
| 7.4 | Clock — data found | Modal title "Last session"; shows date and set table (Set / Weight / Reps) |
| 7.5 | Trophy — data found | Modal title "Best session"; shows the workout date and sets from the session with the highest single-set weight |
| 7.6 | Bolt — data found | Modal title "Best · 60 days"; same as trophy but limited to last 60 days |
| 7.7 | No completed workouts (any mode) | "No completed workouts with this exercise yet." |
| 7.8 | Bolt — no data in the last 60 days but data exists all-time | "No completed workouts with this exercise yet." (60-day window is empty) |
| 7.9 | Weight is null for a set | Displays `—` in the Weight column |
| 7.10 | Reps is null for a set | Displays `—` in the Reps column |
| 7.11 | Tap outside modal or ✕ | Modal closes |
| 7.12 | Save (not complete) a workout | Last-session and best-session data do **not** update — only completed workouts count |
| 7.13 | Complete a workout with exercise X | All three modals for X may return updated data on next open |

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

## 9. Copy / Paste clipboard

Session-only clipboard (cleared on page refresh). Copy is available on completed workouts, active workouts, templates, and the calendar day popup. Paste is available in the workout logger (in-progress) and the template editor.

| # | Action | Expected result |
|---|--------|----------------|
| 9.1 | Tap "Copy" on a **completed** workout | Exercises copied to clipboard; button briefly shows "Copied!" |
| 9.2 | Tap "Copy" on an **in-progress** workout | Current local set list copied; button briefly shows "Copied!" |
| 9.3 | Tap copy icon in **calendar day popup** (completed or in-progress workout) | Exercises copied to clipboard; icon briefly highlights |
| 9.4 | Tap "Copy" in the **template editor** | Template exercises copied to clipboard; button briefly shows "Copied!" |
| 9.5 | Navigate to `/workouts` with clipboard data | Orange dashed banner appears at top: shows exercise count + source date + "Paste as template" button |
| 9.6 | Tap "Paste as template" | New template created with clipboard exercises; navigates to template editor to review/rename |
| 9.7 | Paste as template — clipboard cleared afterwards | Banner disappears from `/workouts` after paste completes |
| 9.8 | Tap "Paste" in **workout logger** with **no existing sets** | Sets loaded from clipboard (expanded to individual set rows); no confirmation needed |
| 9.9 | Tap "Paste" in **workout logger** with **existing sets** | Overwrite confirmation modal appears |
| 9.10 | Confirm overwrite in logger | Existing sets replaced with clipboard content |
| 9.11 | Cancel overwrite in logger | Sets unchanged, modal dismissed |
| 9.12 | Tap "Paste" in **template editor** with **no existing exercises** | Template exercise list replaced with clipboard content; no confirmation needed |
| 9.13 | Tap "Paste" in **template editor** with **existing exercises** | Overwrite confirmation modal appears |
| 9.14 | Confirm overwrite in template editor | Exercises replaced with clipboard content |
| 9.15 | Cancel overwrite in template editor | Exercises unchanged |
| 9.16 | Refresh any page | Clipboard is cleared (session-only, no persistence) |

---

## 10. Calendar day popup — workout overview

| # | Action | Expected result |
|---|--------|----------------|
| 10.1 | Tap a cell with a **completed** workout | Popup shows header with date label + copy icon, and a brief exercise list (name + set count per exercise) |
| 10.2 | Tap a cell with an **in-progress** workout | Same popup with exercise list based on saved sets |
| 10.3 | Popup while sets are loading | Spinner shown in place of exercise list |
| 10.4 | Workout has no sets (empty) | "No sets logged." message shown in exercise list area |
| 10.5 | Tap copy icon in popup header | Workout exercises copied to clipboard; icon briefly highlights orange |
| 10.6 | Popup for **planned** workout | No exercise list shown; only "Start now" and "Remove" buttons (no copy icon) |
| 10.7 | Popup for **empty day** | No exercise list; standard "Log/Schedule" flow (no copy icon) |

---

## 11. History access in add-set form

The four icon buttons (i, clock, trophy, bolt) must be reachable while the user is filling in a new set — before any set for that exercise exists in the current session.

| # | Scenario | Expected result |
|---|----------|----------------|
| 11.1 | Select an exercise via the picker (add-set form visible, zero sets for that exercise in session) | The add-set form header shows the i, clock, trophy, and bolt buttons next to the exercise name |
| 11.2 | Tap the clock button while the add-set form is showing | Last session modal opens; form remains visible beneath it |
| 11.3 | Dismiss the modal (✕ or outside tap) | Form is still showing; weight/reps inputs are unchanged |
| 11.4 | Tap the i button while the add-set form is showing | Exercise info modal opens; form remains visible |
| 11.5 | Dismiss info modal | Form still showing |
| 11.6 | Exercise has no completed workout history | Clock/trophy/bolt buttons still visible; modals show "No completed workouts with this exercise yet." |
| 11.7 | Add a set via the form | Set appears in the grouped exercise list; that group's header also shows the four buttons (existing behaviour, no regression) |
| 11.8 | Use "+" quick-add on an exercise that already has sets | Add-set form shows the four history buttons (same as 11.1) |

---

## 12. Performance buttons in exercise picker

| # | Scenario | Expected result |
|---|----------|----------------|
| 12.1 | Open exercise picker ("Add exercise") | Every visible row shows i, clock, trophy, and bolt buttons alongside the exercise name |
| 12.2 | Scroll the picker list | Buttons remain present at all scroll positions |
| 12.3 | Tap clock on a picker row | Last session modal opens; picker remains open and visible behind it |
| 12.4 | Dismiss modal | Picker is still open; the exercise was **not** selected; no add-set form appeared |
| 12.5 | Tap trophy on a picker row | Best session modal opens; picker remains open |
| 12.6 | Tap bolt on a picker row | Best · 60 days modal opens; picker remains open |
| 12.7 | Tap i on a picker row | Info modal opens; picker remains open |
| 12.8 | Tap the exercise name / row body (outside the four buttons) | Exercise is selected, picker closes, add-set form opens (existing behaviour, no regression) |
| 12.9 | Picker opened from template editor | Same four buttons present per row |

---

## 13. Scroll position in exercise picker after modal

| # | Scenario | Expected result |
|---|----------|----------------|
| 13.1 | Scroll picker to an exercise below the fold, tap i | Modal opens |
| 13.2 | Dismiss modal | Picker scroll position is exactly where it was before the modal opened; the triggering row is still on screen without scrolling |
| 13.3 | Same as 13.1–13.2 but with clock, trophy, or bolt | Scroll position restored identically |
| 13.4 | Dismiss via ✕ vs outside tap vs back gesture | Scroll position is restored regardless of dismissal method |
| 13.5 | Picker was at the top (not scrolled) when modal opened | After dismissal picker is still at the top — no unintended scroll |

---

## 14. Add-set form inline with target exercise

| # | Scenario | Expected result |
|---|----------|----------------|
| 14.1 | Workout has two exercises; tap "+" on the first exercise | Add-set form appears below the first exercise's set rows, **above** the second exercise — not at the bottom of the page |
| 14.2 | Fill in form and tap "Add" | New set row appears as the last row in the first exercise's group; form stays inline with that exercise |
| 14.3 | Tap "+" on the first exercise again (another set) | Form remains inline with first exercise; still above the second exercise |
| 14.4 | Tap "+" on the second exercise | Form moves to below the second exercise's sets |
| 14.5 | Tap the "Add exercise" dashed button | Exercise picker opens (no change to this path) |
| 14.6 | Workout has three or more exercises | "+" on any exercise shows the form inline with that exercise, not at the bottom |

---

## 15. Auto-save after adding a set

| # | Scenario | Expected result |
|---|----------|----------------|
| 15.1 | Add a set (weight and/or reps filled, tap "Add") | Set appears in list; sets are persisted to DB automatically |
| 15.2 | Reload page immediately after tapping "Add" | The added set is present — it was saved |
| 15.3 | Add multiple sets back-to-back quickly | All sets persist, in order; saves are serialized per workout so no rapid-add races a partial snapshot in (ADR-0004) |
| 15.4 | Tap manual "Save" button after auto-save already ran | Save runs without showing the first-time warning (already satisfied) |
| 15.5 | Tap "Done" | Workout marked completed; all sets saved; redirects to /dashboard |
| 15.6 | Inline edit a set value then tap elsewhere | Edit lives in local state only — not auto-saved; "Unsaved changes" indicator appears; cleared by the next successful Save/Done or autosaved add (ADR-0004 dirty tracking) |
| 15.7 | Delete a set | Deletion lives in local state only — not auto-saved; "Unsaved changes" indicator appears; same clearing rule as 15.6 |
| 15.8 | Open a completed workout | No "Add" button; auto-save never runs |
| 15.9 | A save fails (network blip, RLS hiccup, etc.) | A visible, `aria-live` "Not saved — …" banner with Retry appears; `beforeunload` stays armed even if `localSets` is otherwise unremarkable (ADR-0004) |
| 15.10 | Tap "Done" while the most recent save has failed | Stays on the logger with the error shown; does **not** redirect to /dashboard (ADR-0004) |
| 15.11 | The set-persistence RPC (`save_workout_sets`) is not yet migrated | Client falls back to insert-new-before-delete-old; a failed fallback insert never triggers the delete, so an existing snapshot is never wiped (ADR-0004, `docs/database.md` Phase 8) |

---

## 16. Exercise technique modes

| # | Scenario | Expected result |
|---|----------|----------------|
| 16.1 | Tap technique selector on any exercise card in the logger | Options appear: Normal, Drop Set, AMRAP, Rest-Pause, Myo-Reps, Cluster Set |
| 16.2 | Default technique for a new exercise | "Normal" — existing set-logging behaviour unchanged |
| 16.3 | Select "Drop Set" on an exercise | Exercise card shows "DROP SET" badge; add-set form reflects drop-set mode |
| 16.4 | Log multiple sub-sets under Drop Set | Sub-sets displayed grouped in descending weight order; each sub-set labelled (e.g., "10 kg × 8", "9 kg × 12", "8 kg × failure") |
| 16.5 | Select "AMRAP" on an exercise | Set row labelled "AMRAP"; reps entered after the set completes (actual count); no predetermined rep target |
| 16.6 | Two exercises in the same workout with different techniques | Each exercise carries its own technique label independently |
| 16.7 | Normal exercise in same workout as Drop Set exercise | Normal exercise logs identically to current behaviour — no regression |
| 16.8 | Complete workout with a Drop Set exercise | Completed-workout summary shows technique label per exercise; drop chain visible |
| 16.9 | View exercise history for a Drop Set exercise | Each session entry shows the technique label; weight trend uses the top weight in the chain |
| 16.10 | Load a template into a workout | Template exercises load as "Normal" unless the template itself saved a technique preference |

---

## 17. Rest timer between sets

| # | Scenario | Expected result |
|---|----------|----------------|
| 17.1 | Add a set in an active workout | Rest timer becomes available (auto-starts or "Start rest" button appears) |
| 17.2 | Fixed rest mode — configure 90 s, let countdown reach zero | Alert fires at zero; 90 s recorded as rest for the preceding set |
| 17.3 | Fixed rest mode — add the next set at 60 s (before countdown ends) | Timer stops; 60 s (actual elapsed) recorded — not the configured 90 s |
| 17.4 | Variable rest mode — tap "Start rest", tap "Done resting" at ~45 s | 45 s recorded as rest for the preceding set |
| 17.5 | Variable rest mode — add next set while timer running (without tapping "Done resting") | Timer stops; actual elapsed time recorded |
| 17.6 | Timer running — user adds next set immediately | Timer dismisses; the next set can be entered without waiting |
| 17.7 | Rest timer never blocks set entry | User can always tap "Add" regardless of timer state |
| 17.8 | Completed-workout summary | Rest duration shown alongside each set row |
| 17.9 | Exercise history | Rest durations visible per session entry |
| 17.10 | Completed (read-only) workout | No rest timer appears |
| 17.11 | First set of the session (nothing to rest from) | No timer starts until the first set has been added |

---

## 18. Exercise picker muscle & category filter

| # | Scenario | Expected result |
|---|----------|----------------|
| 18.1 | Open exercise picker | Muscle chip row and category chip row appear below the search input; all chips inactive; full exercise list shown |
| 18.2 | Tap one muscle chip (e.g. "chest") | Chip turns orange/active; list narrows to exercises where `muscles` contains "chest" |
| 18.3 | Tap a second muscle chip (e.g. "triceps") | List shows exercises that target chest **or** triceps (union, not intersection) |
| 18.4 | Tap an active chip again | Chip deactivates; list expands back accordingly |
| 18.5 | Tap a category chip (e.g. "strength") while muscle chips are active | List narrows further — must satisfy muscle OR **and** category OR **and** text |
| 18.6 | Type in search box with muscle + category chips active | All three constraints apply simultaneously with AND logic |
| 18.7 | Combination that matches zero exercises | "No exercises match your filters." message + "Clear filters" button |
| 18.8 | Tap "Clear filters" | All chips deactivate, text cleared, full list restored |
| 18.9 | Exercise with `muscles = null` | Never appears when any muscle chip is active |
| 18.10 | Close picker and reopen | Chip selections are reset — starts clean |
| 18.11 | Picker used from template editor | Same filter behaviour as from workout logger |
| 18.12 | Open exercise info modal from within the picker; tap a primary muscle chip in the modal | Info modal closes; that muscle chip is now active in the picker; scroll position is restored (see §13) |
| 18.13 | Open exercise info modal from workout logger (not from picker); tap a primary muscle chip | Chip is display-only — no filter side-effect; behaviour unchanged from today |

---

---

## 19. Cardio exercise unit-aware logging

| # | Scenario | Expected result |
|---|----------|----------------|
| 19.1 | Select a cardio exercise (e.g. "Running") via the picker | Picker closes; add-set form shows duration (minutes) and distance fields — **no** weight or reps inputs |
| 19.2 | Select a strength exercise (e.g. "Bench Press") in the same workout | Add-set form shows weight (kg) and reps — no duration or distance fields |
| 19.3 | Log a cardio set with duration only (leave distance blank) | Set row shows duration only; distance omitted |
| 19.4 | Log a cardio set with duration and distance | Set row shows "X min · Y km" (or Y m depending on user preference) |
| 19.5 | Workout contains both cardio and strength exercises | Each exercise group shows the correct field layout independently; no cross-contamination |
| 19.6 | Complete a workout with a cardio set | Completed-workout summary row shows duration/distance, not weight/reps |
| 19.7 | Reload a completed workout that has cardio sets | duration_minutes and distance values are present — not overwritten with null |
| 19.8 | Cardio set in performance-history modal (clock/trophy/bolt) | Modal shows duration column, not weight column |
| 19.9 | Exercise history chart for a cardio exercise | Chart plots duration (not weight) on the primary axis |
| 19.10 | User preference: km selected | All distance values in set rows and history display in km |
| 19.11 | User preference: m selected | All distance values display in metres |

---

## 20. Modal dialog contract (WP-08, ADR-0008)

Every overlay in the app (LastPerfModal, ExerciseInfoModal, ExercisePickerSheet, and
the eight inline WorkoutLogger dialogs — template import, save-progress warning,
paste-overwrite confirm, discard-edits confirm, abandon confirm, guided-set setup,
per-exercise note editor, whole-exercise guide setup) renders through the shared
`Modal` primitive (`src/components/Modal.tsx`). This section documents the contract
those overlays share; §7.11/§11.3/§12.4/§13/§18.12 rows above still hold — the
dismissal *methods* they refer to now include Escape.

| # | Scenario | Expected result |
|---|----------|----------------|
| 20.1 | Any dialog opens | `role="dialog"`, `aria-modal="true"`, and an accessible name (`aria-label`) are present |
| 20.2 | Any dialog opens | Focus moves inside the dialog (its first focusable control, unless the dialog designates another, e.g. the picker's search input or the note editor's textarea) |
| 20.3 | Press Tab repeatedly while a dialog is open | Focus cycles only among controls inside the dialog; it never reaches the page behind it |
| 20.4 | Press Escape while a non-destructive dialog is open | Dialog closes |
| 20.5 | Dialog closes (any method) | Focus returns to the control that opened it |
| 20.6 | Click the backdrop of a non-destructive dialog | Dialog closes (unchanged from today's tap-outside behaviour) |
| 20.7 | Click the backdrop of a **destructive-confirm** dialog (save-progress warning, paste-overwrite, discard-edits, abandon) | Dialog stays open — only its own Cancel/Confirm buttons or Escape dismiss it |
| 20.8 | Press Escape while a destructive-confirm dialog is open | Dialog closes (Escape is not exempted — only backdrop click is) |
| 20.9 | One dialog opens another on top of it (e.g. exercise info opened from within the picker sheet) | Both are present in the DOM (`role="dialog"` count = 2); Escape closes only the topmost one, leaving the one underneath open |
| 20.10 | The picker sheet's search input, muscle/category filter dropdowns, and internal scroll | Unchanged — Modal wraps the sheet's existing markup without altering its internal state or scroll behaviour |

---

## Known gotchas to recheck after schema changes

- `routines.id` is **UUID** — never pass through `Number()`. Use `string | number` in DAL functions.
- `workouts.id` is integer — `Number(id)` in page params is safe.
- `workouts.status` defaults to `'in_progress'` — backfill needed if you want old rows counted as `completed`.
- Exercise history and last-session data only query `status = 'completed'` — saving progress never appears.
- Template sets are **never pre-populated into the `sets` table** when starting a workout. They live in WorkoutLogger client state only until the user saves/completes.
- `getWorkoutWithSets` returns `template_id` — used by the page to fetch `initialTemplate` only when the workout is in-progress and has no sets yet.
- The `beforeunload` guard is intentionally skipped for `status = 'completed'` workouts to avoid false browser warnings.
- "Edit" on a completed workout **does not** set `status = 'in_progress'` in the DB. It flips a local `isEditing` flag. Only tapping "Done" writes to the DB.
- Tapping "← Back" while in `isEditing` mode shows a "Discard changes?" prompt — "Discard" calls `setIsEditing(false)` (no DB write), "Keep editing" dismisses the prompt.
- CalendarView receives templates server-side as `initialTemplates` prop so the template picker is instant on first day click — no client-side fetch needed.
- Exercise order in WorkoutLogger is tracked via a separate `exerciseOrder: number[]` array derived alongside the `grouped` object. `Object.entries` is **not** used for rendering (JS sorts numeric keys, breaking insertion order).
- ↑/↓ reorder buttons are always visible when 2+ exercises exist — there is no separate "reorder mode" toggle.
- `TemplateEditor` receives optional `date` and `workoutId` search params. `date > today` → "Schedule" mode (planned workout). `workoutId` → transition existing planned workout.
- When routing to the template editor from the calendar, the workout is **not created** until the user taps "Start now" / "Schedule" in the editor.
- New overlays must render through `src/components/Modal.tsx`, not a bare `fixed inset-0` div — it is the only place dialog semantics/focus-trap/Escape/backdrop rules are decided (ADR-0008). Pass `destructive` for confirms that discard user data; everything else defaults to backdrop-closes. `Modal` only supplies the `role="dialog"` wrapper and focus behaviour — callers keep their own backdrop/panel classNames so visual layout is unaffected. The Escape/Tab decisions live in the pure, unit-tested `src/lib/modalFocus.ts`; stacking order (which dialog is topmost when one opens another) lives in `src/lib/modalStack.ts`.
