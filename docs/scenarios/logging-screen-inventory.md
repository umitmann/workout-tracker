# Logging screen — behaviour inventory (interview in progress)

This docket is the running output of a tile-by-tile interview over the **active
logging screen** (`WorkoutLogger.tsx`, `status !== 'completed'`). Each tile pins:
what STAYS, what is VARIANT (configurable / may change), and the CONTRACT
(given/when/then/invariant). The nine WhatsApp field notes fold into the tile
they belong to. A full refactor follows once the inventory is complete.

The same file also renders the **completed (read-only)** view and the
**editing-a-completed-workout** view; those reuse these tiles and are covered at
the end.

Status legend: ✅ pinned · 🔶 in progress · ⬜ not yet interviewed

## How to resume this interview

Run the interview **one tile at a time, one question at a time** (per the
`clarify-scenario` skill in `../DTRH-2026-planner/.claude/skills/clarify-scenario`).
For each tile: ground in the code first (cite `file:line`), lead with the feared
regression, pin what STAYS / what is VARIANT / the given-when-then-invariant
CONTRACT, then record it here. The nine WhatsApp field notes each fold into the
tile they belong to. A single refactor follows once the whole screen is pinned.

### Progress
- ✅ Tile 1 — Back button (Save & leave / Delete, two-step)
- ✅ Tile 2 — date/status label (display only)
- ⬜ Tile 3 — distance-unit toggle (deferred to cardio set-row tile)
- ✅ Tile 4 — Copy / Paste (lossless copy; overwrite/append on paste)
- ✅ Tile 5 — Save-state bar (3× jittered auto-retry; block Complete on unsaved)
- ✅ Tile 6 — Rest bar. Sacred-running-timer rule pinned (notes #1, #2). Target
  source resolved: PT prescription in the plan wins per exercise; else one global
  value invariant across exercises (NOT per-exercise memory).
- ✅ Tile 7 — Exercise group header (ⓘ / ◷ last / 🏆 best / best·60 / inline Last).
  Read-only reference over completed history only. "Best" stays = heaviest-single-
  set's session. Latent issue flagged: ◷/inline Last scan only the last 50 workouts.
- ✅ Tile 8 — Controls row (reorder ↑↓, ▶ All, quick-add +). Reorder = pure
  neighbor swap. quick-add + opens the prefilled add-set form; prefill source
  extended to last weight/reps from this workout, else the previous session.
- ✅ Tile 9 — Set rows (✓ done / edit / ✕ delete, weight·reps or duration·distance).
  Folds field note: typed values AUTO-COMMIT as a kept-but-not-done set on tap-away
  — nothing typed is ever discarded. Delete stays two-tap (ADR-0008).

### Remaining tiles to interview (top → bottom)
- Tile 10 — Add-set form: the Stepper (weight/reps), ▶ Guided, Add
  · folds field notes: *"always goes back to 12.5?"*, *"open a 1–10 panel instead
    of keyboard + .25/.5/.75 buttons"*, *"last set: 1 to 5 how heavy it was"* (NEW
    RPE/difficulty feature — does not exist yet)
- Tile 11 — DRUH single-set guide (full-screen)
- Tile 12 — Whole-exercise guide ▶ All: setup screen + play
  · folds field notes: *"weight reps is reversed order in guide"*, *"play mode →
    come back → first exercise is lost"*
- Tile 13 — Footer: Import, Paste, Complete/Done
- Tile 14 — Completed (read-only) view — reuses tiles above
- Tile 15 — Editing a completed workout — reuses tiles above
- STILL UNPLACED field note: *"manual enter should overwrite the upper lower
  thing"* — meaning not yet identified; ask what "the upper lower thing" is when
  its tile is reached (likely the guide setup or a prefill source).

### Model/refactor items surfaced so far
- Clipboard type must carry per-set numbers, not `{ setCount, reps, weight }`
  (Tile 4). `PasteTemplateButton.tsx` consumes the same clipboard — update in lockstep.
- Save queue needs bounded jittered auto-retry + a Complete-gating check on
  dirty/error (Tile 5).
- `startRestFor` must become start-only-if-idle, with the explicit button as the
  sole restart path (Tile 6).
- Rest target needs a PT-prescribed source on the plan: add a rest field to
  `routine_exercises` (parallel to `tempo`, `dal.ts:544`) + a TemplateEditor
  control to set it. The logger reads it like `ptTempo` and falls back to the one
  global stepper value. The global target/mode stay single scalars — NOT a
  per-exercise learned map (Tile 6). Distinct from `sets.rest_seconds`, which is
  the timer's *logged elapsed*, not a prescribed target.
- ◷ Last / inline "Last:" scan only the 50 most recent completed workouts
  (`dal.ts:293`), so a rotated exercise shows blank Last while all-time Best still
  resolves — query last-by-exercise_id instead, or document the cap (Tile 7).
- `handleSelectExercise` (:308) prefills only from the current workout's last set,
  so an exercise's first set this session opens blank. Extend prefill to fall back
  to the previous session's last set for that exercise (reuse `getLastExercise-
  Performance` / `lastPerf`) so the form always seeds with last weight/reps (Tile 8).
- Auto-commit typed values (Tile 9): (a) the add-set form must flush typed
  weight/reps into a not-done set when the user navigates away / re-selects an
  exercise, instead of dropping them — guard against committing a fully-empty form;
  (b) `saveEditSet` (:655) writes `null` on an empty field, wiping a previously-saved
  value — align it with `completeFromEdit` (:458) which falls back to the prior
  value; (c) an auto-committed not-done set must NOT start rest (only ✓/Complete
  does — Tile 6), and editing an already-done set on blur keeps it done.

---

## Tile 1 — Header: Back button ✅

Seam: `WorkoutLogger.tsx` `handleBack` (:708), abandon prompt (:1759),
`deleteWorkout` action (`actions/workouts.ts:99`).

**Feared regression:** an accidental Back tap loses a session mid-workout. Today
the button says "Abandon" with copy "Your sets will not be saved" — but it
actually only navigates to the dashboard (workout stays `in_progress`); the copy
is misleading and there is no real delete from here.

**Decision:** leaving always saves. Every **Add** already autosaves (ADR-0004
save queue), so there is nothing meaningful to lose on leave — drop the
"abandon"/"leave unsaved" wording entirely.

### Contract
- given: an active workout with at least one set, on the logging screen
- when: Back is tapped
- then: a sheet offers exactly two choices — **Save & leave** and **Delete workout**
- given: Save & leave is chosen
- when: confirmed
- then: any pending autosave is flushed, then navigate to the dashboard; the
  workout remains `in_progress` and is fully resumable
- given: Delete workout is chosen
- when: confirmed at a **second** "Are you sure?" step
- then: `deleteWorkout` removes the entire entry and navigates to the dashboard
- given: an active workout with **no** sets
- when: Back is tapped
- then: navigate straight to the dashboard, no sheet (nothing to lose)
- invariant: an active workout is NEVER lost by navigating away — the only path
  that destroys data is the explicit two-step Delete
- invariant: no wording anywhere implies leaving loses data ("abandon", "your
  sets will not be saved" are removed)

### Steps
1. Start a workout, add two sets, tap Back → sheet shows Save & leave + Delete
2. Tap Save & leave → dashboard; reopen the workout → both sets present
3. Tap Back → Delete workout → "Are you sure?" → confirm → dashboard; workout
   entry is gone from history
4. Start a workout, add nothing, tap Back → straight to dashboard, no sheet

---

## Tile 2 — Header: date/status label ✅ (display only, no interview)

"Active" (orange) / "Completed" (green) + date. Pure status display; not grilled.

---

## Tile 3 — Header: distance-unit toggle (km/m) ⬜

Only rendered when the workout has cardio sets (:1151). Deferred until we reach
the cardio set-row tile — its behaviour is coupled to how distance is shown there.

---

## Tile 4 — Header: Copy / Paste (workout clipboard) ✅

Seam: `handleCopy` (:818), `applyPaste`/`handlePasteRequest` (:788),
`WorkoutClipboardContext.tsx`, `PasteTemplateButton.tsx`.

**Feared regression:** (a) a **silent lossy copy** — today Copy only captures
set #1's weight/reps per exercise plus a set count, so 60×10 / 60×8 / 50×6
copies as "3 × 60×10"; (b) **paste silently wipes** work already logged.

**Decision — Copy is lossless and state-independent.** Copy captures the EXACT
set list — every exercise, every set's own weight/reps, and order — identically
on active, completed, and editing views. No flattening, no interpretation.

> **Model change this forces (refactor item):** the clipboard type
> `ClipboardEntry = { exerciseId, setCount, reps, weight }` cannot represent
> per-set numbers. The clipboard must carry the actual per-set list (e.g.
> `entries: { exerciseId, exerciseName, sets: { weight, reps }[] }[]`), and
> `applyPaste` must rebuild from that list rather than from `setCount × one pair`.
> `PasteTemplateButton.tsx` (workouts list) consumes the same clipboard and must
> be updated in lockstep.

**Decision — Paste target rule.** Empty workout → paste directly. Non-empty →
prompt with **Overwrite** / **Append** / cancel. Wiping is never the silent
default.

### Contract
- given: any workout view (active / completed / editing) with sets
- when: Copy is tapped
- then: the clipboard holds the exact per-set list (each exercise, each set's
  weight+reps, in order) — identical bytes regardless of which view copied it
- given: the clipboard has content and the target workout is empty
- when: Paste is invoked
- then: the exact copied set list is reproduced (same exercises, per-set
  weight/reps, order)
- given: the clipboard has content and the target workout already has sets
- when: Paste is invoked
- then: a prompt offers **Overwrite** (replace all) / **Append** (add after
  existing) / cancel
- invariant: Copy never flattens or averages sets — a pasted workout is set-for-set
  identical to the copied source
- invariant: Paste never destroys existing sets without an explicit Overwrite choice

### Steps
1. Log 60×10, 60×8, 50×6 for an exercise; Copy; paste into an empty workout →
   all three distinct sets reproduced (NOT three identical sets)
2. Copy from a completed workout, paste into an active empty one → identical
3. Paste into a workout that already has a warm-up set → prompt; choose Append →
   warm-up kept, copied sets added after; choose Overwrite → warm-up replaced

---

## Tile 5 — Save-state bar (autosave safety net) ✅

Seam: save-state strip (:1195-1208), `saveQueue.ts`, `handleComplete` (:767),
`persist` (:363). Feeds the `beforeunload` guard (:222).

**Already true (do not re-spec):** the queue serializes + coalesces saves per
workout, tracks dirty/pending/error, and `idle()` lets Complete wait out an
in-flight save. Add already autosaves.

**Feared regression:** a save silently fails on flaky gym wifi, the red bar is
scrolled off-screen, the user walks out and the data is gone.

**Gaps today (both are new work):**
1. No auto-retry — on error the queue stops and waits for a manual Retry tap.
2. Complete is NOT blocked by a prior error — `handleComplete` waits for *idle*
   (no in-flight save), but a failed save is idle-with-error, so Complete can
   still fire over an unsaved state.

**Decision — auto-retry:** on a failed autosave, retry automatically up to
**3 times with jittered backoff**. If all 3 fail, surface a persistent
"couldn't save yet" notice + manual Retry. (Bounded → no infinite loop;
jittered → no thundering herd; loud on final failure → never silent.)

**Decision — block Complete on unsaved:** Complete is disabled / refuses while
the queue has a `dirty` or `error` state; it may only proceed once the latest
snapshot has successfully persisted. Finishing a workout with unsaved data is
impossible.

### Contract
- given: an autosave request fails (network/transport)
- when: the failure is observed
- then: the app retries automatically, up to 3 attempts with jittered backoff,
  with no user action required
- given: all 3 auto-retries fail
- when: the last attempt fails
- then: a persistent "couldn't save yet" notice + Retry control is shown (not a
  transient toast); the beforeunload guard stays armed
- given: the queue has unsaved changes (dirty) or a save error
- when: Complete is tapped
- then: Complete does not proceed; the user is told to wait for / resolve the save
- given: a previously failed save later succeeds (auto-retry or manual)
- then: the notice clears and Complete becomes available
- invariant: a workout can never be marked completed while any set is unsaved
- invariant: a save failure is never silent — either it recovers automatically or
  it shows a persistent, actionable notice
- invariant: auto-retry is bounded (never an infinite loop)

### Steps
1. Log a set with the network offline → red/"saving…" then auto-retries; bring
   network back within 3 attempts → clears to saved, no user action
2. Keep network off through all 3 attempts → persistent "couldn't save yet" +
   Retry appears
3. With that notice showing, tap Complete → refused/disabled; restore network,
   Retry succeeds → notice clears, Complete now works

---

## Tile 6 — Rest bar (sticky) ✅  ← field notes #1 and #2

Seam: rest bar (:1212-1249), `RestTimer.tsx`, `restTimer.ts`, `startRestFor`
(:186), `restForSet`/`restNonce` (:182-185), `finishRest` (:638).
Folds in notes: *"manual start rest never overwritten by complete"*,
*"already started rest never overwritten by complete"*.

**Feared regression:** you're mid-rest at 0:45; you tap ✓ on a set you forgot,
or add/remove a set, and the running rest silently resets to 0:00. Today
`startRestFor` unconditionally bumps `restNonce` and remounts the timer onto the
newest set, wiping the running one — auto-complete on ANY set clobbers rest.

**Decision — a running rest timer is SACRED.**
- Completing a set (via ✓, Add, edit-complete, or guided-stop) starts rest
  ONLY IF no timer is currently running. If one is running, the set is logged
  and the timer is left completely untouched — no reset, no re-point.
- A running rest stays attached to the set it was started for. Elapsed logs to
  THAT set on Done. A set completed while a rest runs simply records no rest
  (nothing ran for it) — this is correct, not a bug.
- Adding or removing sets never touches a running rest (user may be doing admin).
- The ONE deliberate exception: the explicit **"Start rest"** button. Tapping it
  while a rest runs logs the current elapsed to its set, then starts a fresh
  timer from 0:00. Implicit actions are sacred; the explicit button is allowed.

**Decision — where the rest TARGET comes from (resolves the open question).**
Two sources, in priority order:
1. **PT prescription in the plan wins.** If the template prescribes a rest target
   for an exercise (a new field on `routine_exercises`, parallel to `tempo`), that
   is the target while resting from that exercise.
2. **Else one global value, invariant across exercises.** With no prescription,
   every exercise uses the single global stepper value (localStorage `wt.restTarget`
   / `wt.restMode`), exactly as today — one shared number for the whole screen.

The target does NOT drift per exercise on its own: there is **no per-exercise
memory / learned map**. It only differs between exercises when the plan explicitly
prescribes different values. `sets.rest_seconds` (the timer's logged elapsed on a
completed set) is a separate concept and is untouched by this.

VARIANT (stays configurable): Fixed vs Variable mode (global); the global target
seconds (±5s) used as the fallback; the per-exercise prescribed target set by the
PT in the template; which set manual Start rest attaches to (currently the last set).

### Contract
- given: no rest timer is running
- when: a set is completed (✓ / Add / edit-complete / guided-stop) for a
  non-cardio exercise
- then: a rest timer starts for that set
- given: a rest timer is already running (started for set A)
- when: another set B is completed by any implicit means
- then: the timer keeps running unchanged and still belongs to set A; set B
  records no rest
- given: a rest timer is running
- when: a set is added or deleted
- then: the timer is unaffected (keeps counting from where it was)
- given: a rest timer is running
- when: the explicit "Start rest" button is tapped
- then: the current elapsed is logged to its set, and a fresh timer starts at 0:00
- given: an exercise whose plan (template) prescribes a rest target
- when: a rest timer starts for one of its sets
- then: the timer counts toward the PT-prescribed target, not the global stepper value
- given: an exercise with no prescribed rest in the plan
- when: a rest timer starts for one of its sets
- then: the timer counts toward the single global target (localStorage stepper),
  the same value used for every other unprescribed exercise
- invariant: no implicit action ever resets or re-points a running rest timer
- invariant: rest elapsed is always logged to the set the timer was started for
- invariant: cardio set completion never starts a rest (unchanged, `startsRestOnComplete`)
- invariant: the global target never varies per exercise on its own — only an
  explicit PT prescription makes an exercise's target differ from the global value

### Steps
1. Complete set 1 → rest starts. At ~0:45 complete set 2 → rest STILL at 0:45+,
   still counting, not reset
2. Tap Done on that rest → 0:45+ logged to set 1; set 2 shows no rest row
3. Start a rest; add a new set, then delete a different set → rest keeps running
   untouched
4. While a rest runs, tap the explicit "Start rest" button → old elapsed logged,
   new timer at 0:00
5. Exercise A has a plan-prescribed 180s rest, B has none → rest from A targets
   180s; rest from B targets the global stepper value; nudging the global stepper
   changes B's target but not A's

---

## Tile 7 — Exercise group header (reference affordances) ✅

Seam: header Row 1 (:1256-1290), `handleInfoClick`, `handlePerfClick` (:677),
`getLastExercisePerformance`/`getBestExercisePerformance` (`dal.ts:288`, `:349`),
`selectBestSession` (`dalCores.ts:41`), inline "Last:" (:1324), `lastPerf` load (:254).

The exercise title plus four reference affordances and one inline summary line:
- **ⓘ info** — opens the exercise-details modal.
- **◷ last** — most recent *completed* workout (scanning the last 50) that contains
  this exercise; shows all its sets in a modal.
- **🏆 best** — across all completed workouts, the session containing the single
  highest-weight set; reps-only/bodyweight falls back to most-recent. Whole session shown.
- **best·60** — the same "best" rule windowed to the last 60 days.
- **inline "Last:"** — a preloaded one-line summary of the last session, always shown.

**Feared regression:** the numbers you consult mid-set become misleading — a "best"
that isn't your real best effort, or reference figures that silently reflect the
*current* in-progress workout and move under you as you log.

**Decision — "Best" stays = the heaviest-single-set's session.** The session
containing your single highest-weight set wins, and its whole set list is shown
(today's `selectBestSession`). Not e1RM, not volume. Accepted as the stable rule.

VARIANT (may change later): the "best" scoring rule (e1RM / volume were considered
and declined for now); whether warm-up sets should be excluded from the pool
(today they are NOT — a heavy warm-up top-set can define "best"); the 50/60-day windows.

### Contract
- given: the logging screen for any exercise
- when: ⓘ / ◷ / 🏆 / best·60 is tapped, or the inline "Last:" renders
- then: a read-only modal or text is shown; the live workout's sets are never
  created, edited, deleted, or reordered by any of these
- given: "best" (all-time or 60-day) is requested
- when: computed
- then: the winning session is the one holding the single heaviest-weight set in
  the candidate pool; its full set list is displayed
- given: an exercise with no weighted sets in history (reps-only/bodyweight)
- when: "best" is requested
- then: it falls back to the most recent session that has any sets
- invariant: every affordance here is READ-ONLY — none mutates the current workout
- invariant: all figures compare against **completed** history only; the
  in-progress workout is never counted as "last" or "best"
- invariant: "best" is defined solely by heaviest single set, consistently across
  all-time and 60-day windows

### Steps
1. Tap ⓘ / ◷ / 🏆 / best·60 in turn → each opens its modal; the live set list is
   unchanged after closing every one
2. History has a 100kg×1 day and a 95kg×5×5 day → 🏆 Best shows the 100kg×1 session
3. Log a new heaviest-ever set in the *current* (in-progress) workout, reopen 🏆 →
   still shows the historical best, not the in-progress set

### Latent issue surfaced (refactor item)
`getLastExercisePerformance` only scans the **50** most recent completed workouts
(`dal.ts:293-299`). An exercise not trained within those 50 sessions returns null,
so both ◷ Last and the inline "Last:" line go blank even though older history
exists. "Best" (all-time) has no such limit, so the two can disagree. Either lift
the scan to "most recent session containing this exercise" (query by exercise_id,
not a fixed workout window) or document the 50-session cap as intended.

---

## Tile 8 — Exercise controls row (reorder / guide-all / quick-add) ✅

Seam: header Row 2 (:1292-1322), `moveExercise` (:831) → `reorderExercise`
(`setListOps.ts:45`), `openGuideSetup` (:545), quick-add + → `handleSelectExercise`
(:308). Row only rendered with >1 exercise for the reorder arrows.

- **reorder ↑↓** — swaps this exercise group with its immediate neighbor (one
  slot), preserving every set and its data; persists via `markDirty` (autosave).
- **▶ All** — opens the whole-exercise guide setup. Entry point only; the guide
  screen itself is Tile 12.
- **quick-add +** — selects this exercise and opens the add-set form prefilled
  with its last weight/reps; you review/adjust and tap Add. Not an instant log.

**Feared regression:** (a) reordering scrambles or drops logged sets, or resets the
running rest timer; (b) the + opens a **blank** form the first time you touch an
exercise in a session, so you retype numbers you did last week that the app already knows.

**Decision — reorder is a pure presentational swap.** ↑↓ moves the whole exercise
group by one position and nothing else — set values, done-state, and any running
rest timer are untouched (consistent with Tile 6: reorder is admin, sacred rest is
not disturbed). Order persists.

**Decision — quick-add + opens the prefilled form (not an instant log), and the
prefill source is the last weight/reps for that exercise.** Resolve the prefill in
priority order: the exercise's **most recent set in the current workout** if one
exists, otherwise **the last set from the previous completed session** for that
exercise. The form is never blank when any history — this workout or prior — exists.

> **Refactor item:** `handleSelectExercise` only reverse-finds within `localSets`
> (current workout), so the first set of an exercise this session opens blank. Add
> the historical fallback via `getLastExercisePerformance` / the already-loaded
> `lastPerf` map. The add-set form (Tile 10) shares this seed, and the "always goes
> back to 12.5?" note there is about the *stepper default* when even history is empty.

VARIANT: whether reorder is one-slot arrows (today) or drag; the + tooltip wording
(should read "Add a set", not "Quick-add", since it opens a form).

### Contract
- given: a workout with ≥2 exercises
- when: ↑ or ↓ is tapped on an exercise
- then: that exercise group swaps position with its neighbor; every set's values,
  order-within-exercise, and done-state are unchanged; a running rest timer keeps
  running untouched; the new order persists
- given: an exercise already has ≥1 set in the current workout
- when: quick-add + is tapped
- then: the add-set form opens prefilled from that exercise's most recent set in
  this workout
- given: an exercise has no set yet in the current workout but has prior history
- when: quick-add + is tapped
- then: the form opens prefilled from that exercise's last set in the previous
  completed session
- invariant: reorder never changes, drops, or reassigns any set — it is pure ordering
- invariant: reorder never resets or re-points a running rest timer (Tile 6)
- invariant: the add-set form seeds with last weight/reps whenever any history
  (current workout or prior session) exists for the exercise

### Steps
1. Two exercises A (2 sets) then B (3 sets); tap ↓ on A → order is B then A; all
   five sets intact with identical values; reopen workout → order persisted
2. Start a rest, then reorder an exercise → rest keeps running untouched
3. Exercise with sets logged earlier this workout, tap + → form prefilled from the
   latest of those sets
4. Exercise not yet touched this workout but done last week at 40kg×10, tap + →
   form prefilled 40kg×10 (was blank before)

---

## Tile 9 — Set rows (per-set display / edit / complete / delete) ✅ ← field note

Seam: display row (:1426-1517), edit row (:1348-1425), `toggleDone` (:399),
`startEditSet` (:647), `saveEditSet` (:655), `completeFromEdit` (:458),
`handleDeleteTap`/two-tap confirm (:1489-1516), `openGuidedSetupForSet` (:1482).
Folds field note: *"if I don't hit complete, the value is removed when tapping elsewhere."*

Each set renders as a row: **✓ done-toggle · #index · weight·reps (or duration·
distance) · [▶ guided when not-done & non-cardio] · ✕ delete**, with a rest line
below when `rest_seconds` is set. Tapping the row body opens the inline editor
(two Steppers / cardio inputs + ▶ guided + ✓ Complete + ✕ cancel). A **not-done**
set is already a first-class visual: dashed border, muted background.

**Feared regression (the field note):** you type a weight/reps, get interrupted, tap
elsewhere without hitting ✓/Complete, and the number vanishes. Today two paths lose
data — the add-set form drops uncommitted input entirely, and `saveEditSet` (blur)
writes `null` for an emptied field, wiping the prior value.

**Decision — typed values AUTO-COMMIT as a kept-but-not-done set.** Tapping away
from any weight/reps entry (add-set form OR inline editor) saves what was typed as
a set that is **kept but not marked done** — no ✓, no rest started. Nothing typed
is ever discarded; you return later and tap ✓ to complete it. This is the direct
kill for the field note and the north-star rule for the whole screen.
- A fully-empty form/field commits nothing (no phantom empty sets).
- Editing an already-done set and tapping away keeps its typed value AND its done
  state (auto-commit's "not-done" applies only to never-completed entries).
- An auto-committed not-done set does NOT start a rest timer — only ✓/Complete does
  (Tile 6).

**Decision — delete stays two-tap.** ✕ arms a Confirm/Cancel pair (ADR-0008),
mirroring the calendar and the Back-button Delete (Tile 1). No single-tap deletes.

VARIANT: the ▶ guided affordance on a not-done set (covered by Tiles 11/12); the
row's exact columns per category; the not-done row styling.

### Contract
- given: the add-set form (or an inline set editor) with typed weight/reps
- when: the user taps elsewhere / navigates away without ✓/Complete/Add
- then: the typed values are saved as a set that is kept but **not** marked done;
  no rest timer starts; the values are visible on the (dashed) row afterwards
- given: an empty add-set form or an editor field left blank
- when: focus leaves it
- then: nothing is committed, and no existing value is nulled — an emptied editor
  field falls back to the set's prior value rather than writing null
- given: an already-completed (done) set is edited
- when: the user taps away
- then: the new value is saved and the set stays done
- given: a not-done set
- when: ✓ is tapped
- then: it becomes done and a rest timer starts if none is running (Tile 6)
- given: any set
- when: ✕ is tapped
- then: a Confirm/Cancel pair appears; the set is removed only on Confirm
- invariant: a typed weight/reps value is NEVER lost by tapping away — it is always
  either committed (as done or not-done) or, if the field was empty, left unchanged
- invariant: only ✓/Complete marks a set done and starts rest; auto-commit never does
- invariant: deleting a set always requires the two-tap confirm

### Steps
1. Type 60×10 into the add-set form, then tap another exercise's row → a not-done
   60×10 set now exists (dashed, no ✓); it survives a reload
2. Tap a done 60×10 set, change to 65, tap away without ✓ → row shows 65 and is
   still done
3. Tap a set, clear the weight field, tap away → weight is NOT nulled (prior value
   kept); clearing is not a data-loss path
4. Tap ✓ on the auto-committed not-done set → it goes done and starts rest
5. Tap ✕ on a set → Confirm/Cancel; Cancel leaves it, Confirm removes it
