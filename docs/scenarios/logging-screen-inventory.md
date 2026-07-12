# Logging screen — behaviour inventory (interview complete except Tile 3)

This docket is the output of a tile-by-tile interview over the **active
logging screen** (`WorkoutLogger.tsx`, `status !== 'completed'`). Each tile pins:
what STAYS, what is VARIANT (configurable / may change), and the CONTRACT
(given/when/then/invariant). All nine WhatsApp field notes are folded into their
tiles. Tiles 1-15 are pinned; only Tile 3 (distance-unit / cardio) is deferred.
A full refactor follows next, working from the model/refactor items list below.

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
- ✅ Tile 10 — Add-set form / Stepper (folds 3 notes). (a) Post-Add re-seeds from
  the last set (kills "goes back to 12.5"). (b) Custom numpad on tapping the value
  (1-9/0, delete, .25/.5/.75); arrows always ±1; same input everywhere weight is
  entered; touch numpad + PC native keyboard. (c) NEW: always-visible 1-5
  difficulty chip per set row.
- ✅ Tile 11 — DRUH single-set guide. Setup (reps/weight/tempo) → full-bleed
  phase timer → logs actual reps to the target/new set. NEW: Stop & log surfaces
  the computed rep count for confirm/adjust before saving (no elapsed over-count).
  Guided-stop is an idle-gated rest caller (Tile 6). Setup reps/weight order fix
  → Tile 12.
- ✅ Tile 12 — Whole-exercise guide ▶ All (setup → ready/set/rest runner → log).
  Folds 2 notes: (a) weight-first ordering everywhere incl. both guide setups +
  GET READY readout; (b) CONFIRMED bug — Exit back to the logging screen loses the
  first exercise's sets (suspected stale-snapshot in `handleGuideDone`; root-cause
  at refactor). Rep-confirm (Tile 11) applied as one end-of-guide review.
- ✅ Tile 13 — Footer (Import / Paste / Complete·Done). Import into a non-empty
  workout gets the SAME Overwrite/Append/cancel prompt as Paste (Tile 4) — no more
  silent replace. Complete keeps ALL sets regardless of ✓ state (confirmed, no
  change). Paste → Tile 4; Complete save-gating → Tile 5.
- ✅ Tile 14 — Completed read-only view. Pure display; reference affordances (Tile 7)
  + lossless Copy (Tile 4) work; difficulty chips read-only. Nothing mutates the
  workout except the explicit Edit entry.
- ✅ Tile 15 — Editing a completed workout. Re-uses the whole active screen; Done
  re-saves and PRESERVES the original date + completed status (verified). NEW:
  entering Edit captures a snapshot; changes autosave live; Back → Discard restores
  the snapshot (no silent partial alteration of history).

### Interview complete except:
- ⬜ Tile 3 — distance-unit toggle (km/m) + cardio set-row display. The ONLY
  un-interviewed piece; deferred pending a dedicated cardio pass. Appears on the
  active header (:1151), completed header (:980), and add-form cardio inputs.
- RESOLVED (was unplaced): *"manual enter should overwrite the upper lower thing"*
  = a manually typed value must overwrite what the ▲/▼ arrows set. Folded into
  Tile 10b as a Stepper invariant.
- All nine WhatsApp field notes are folded and pinned.

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
- Post-Add form retention (Tile 10a): `handleAddSet` (:350-353) blanks weight/reps
  after every Add — instead re-seed from the just-logged set (same source as Tile 8
  prefill) so straight sets need no re-entry. This is what "always goes back to 12.5"
  is really asking for.
- Stepper redesign (Tile 10b), applied to `Stepper.tsx` so it changes *every* weight-
  entry site at once (add form :911, inline editor :1389, guided setup, and the
  routines TemplateEditor): (i) tapping the value opens a **custom numpad** — digits
  0-9, delete, and dedicated .25/.5/.75 fraction keys (fractions only when
  `decimal`, i.e. weight, not reps/tempo); (ii) the ▲/▼ arrows always step by **1**
  (weight's `step={2.5}` at :916 becomes 1; fine fractions come only from the numpad);
  (iii) touch devices get the custom numpad (suppress the OS keyboard), while
  desktop/PC keeps native keyboard entry working. Layout keys beyond 0-9/delete/
  fractions (a done/close key, decimal point) are a build-time detail.
- NEW difficulty feature (Tile 10c): add a nullable `sets.difficulty` (1-5) column
  with the same missing-column graceful-degrade as `rest_seconds` (`dal.ts`,
  `cores.ts`). Render an always-visible 1-5 chip on each non-cardio set row (blank =
  unset). Downstream surfacing (history/report) is out of scope for this tile.
- Guided Stop & log rep confirm (Tile 11): `handleStopEarly` (`DruhTimer.tsx:146`) →
  `handleGuidedStop` (:488) currently save `stopEarlyReps` silently. Insert a
  confirm/adjust step: default to the computed count, let the user bump ±, save on
  confirm; adjusting to 0 logs nothing (existing ≤0 rule). Natural goal-completion
  may skip the confirm (assumption — confirm). After confirm, log + idle-gated
  `startRestFor` (Tile 6). Applies to the whole-exercise guide's per-set stops too
  (Tile 12).
- Weight-first ordering (Tile 12a): the guided-set setup (:1807-1822) and the
  guide-all setup rows (:1931-1932) order Reps→Weight; flip to Weight→Reps to match
  the add form / set rows, and the ExerciseGuide GET READY readout (:207) to
  "{weight}kg × {reps}".
- Guide-all Exit loses first exercise (Tile 12b, CONFIRMED bug): repro = play ▶All,
  tap Exit, return to logging screen → first exercise's sets gone/unlogged. Root-
  cause the `finish`→`onDone`→`handleGuideDone` (:624) path — likely a stale
  `localSets` snapshot captured at guide mount being written back over newer state.
  Desired invariant below. Also give guide-all a single end-of-guide rep review
  (batched Tile 11 confirm) instead of interrupting each set.
- Stepper "manual overwrites arrows" (Tile 10b invariant, ex-"upper lower thing"):
  a value entered by numpad/keyboard is authoritative — a subsequent ▲/▼ bump
  operates on the manually-entered value, and manual entry always overwrites the
  arrow-set value (never the reverse).
- Import overwrite/append (Tile 13): `handleImportTemplate` (:699) silently replaces
  the whole set list — route it through the SAME non-empty prompt as paste
  (Overwrite/Append/cancel), reusing that component; empty workout imports directly;
  Append expands the template after existing sets. Shares the Tile 4 paste seam.
- Edit-completed snapshot/discard (Tile 15): entering Edit (`setIsEditing(true)` :998)
  must capture a pre-edit snapshot of `localSets`; the discard-edits prompt (:1748)
  must RESTORE and persist that snapshot (today it only flips `isEditing` off, leaving
  already-persisted add/toggle changes in place). Done keeps changes + preserves date
  (`completeWorkoutCore` only flips status). Minor: the active header shows "Active"
  while editing a completed workout — label it "Editing" instead.

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

---

## Tile 10 — Add-set form & the Stepper ✅ ← field notes: 12.5 / input redesign / RPE

Seam: `renderAddSetForm` (:838), the weight/reps `Stepper` (:911-926, `Stepper.tsx`),
`commitNumericDraft` (`numericInput.ts`), `handleAddSet` reset (:350-353),
`openGuidedSetup` (:416). Folds three field notes at once.

The non-cardio add form is two `Stepper`s (Weight step 2.5 / Reps step 1) + ▶ Guided
+ Add. The Stepper is a ▲ / tappable-value / ▼ control with hold-to-repeat and a
draft-string text field; there are **no .25/.5/.75 buttons in the current code** (the
note describes a pre-refactor UI / the desired end-state).

### 10a — Post-Add value retention (note: *"always goes back to 12.5?"*)
**Feared regression / pain:** logging straight sets is tedious because after each Add
the form blanks weight/reps (:350-353), so every set is re-entered from scratch.
**Decision:** after Add, the form **re-seeds from the just-logged set** (same prefill
source as Tile 8 — this workout's last set, else the previous session), never resets
to blank or a fixed default. Straight sets become: Add, Add, Add.

### 10b — Weight/reps input redesign (note: *"1–10 panel instead of keyboard + .25/.5/.75"*)
**Decision — a custom numpad, applied to the shared `Stepper` so every weight-entry
site is identical** (add form, inline editor, guided setup, routines TemplateEditor):
- Tapping the value opens a **custom numpad**: digits 0-9, a **delete** key, and
  dedicated **.25 / .5 / .75** fraction keys. Fraction keys appear only in `decimal`
  mode (weight) — not for reps/tempo.
- The **▲/▼ arrows always step by 1** (weight drops from 2.5→1). All sub-integer
  precision comes from the numpad fraction keys, never the arrows.
- **Touchscreen** → the custom numpad opens and the OS keyboard is suppressed.
  **Desktop/PC** → native keyboard entry into the field still works.
- "Every instance in which a weight is added must be the same" — because the change
  lives in `Stepper.tsx`, all sites inherit it automatically.

### 10c — NEW: per-set difficulty rating (note: *"last set: 1 to 5 how heavy it was"*)
Does not exist today (grep confirms no rpe/difficulty). **Decision — an always-visible
1-5 chip on each set row**, tappable anytime, blank until set, editable after the fact
(no prompt, no interruption; never blocks logging or Complete).
- Scale: 1 = easy … 5 = maximal effort (assumption — confirm).
- Shown on non-cardio (weight/reps) sets only (assumption — confirm).
- Stored in a new nullable `sets.difficulty` (1-5) column, graceful-degrading on a
  missing column exactly like `rest_seconds`.
- Purpose: see over time whether a weight is getting easier → when to progress.
  History/report surfacing is out of scope for this tile.

VARIANT: numpad key layout (a done/close key, decimal point); the difficulty scale
direction and labels; whether difficulty ever shows on cardio.

### Contract
- given: a set was just added via Add
- when: the form re-renders for the next set
- then: weight/reps are pre-filled from the just-logged set, not blanked
- given: the weight (or reps) value in any Stepper on a touchscreen
- when: the value is tapped
- then: the custom numpad opens (0-9 + delete, plus .25/.5/.75 for weight); the OS
  keyboard does not appear
- given: the same value on a desktop/PC
- when: it is focused
- then: native keyboard typing works
- given: any Stepper
- when: ▲ or ▼ is pressed
- then: the value changes by exactly 1 (fractions only ever come from the numpad)
- given: any non-cardio set row
- when: the row renders
- then: a 1-5 difficulty chip is shown (blank if unset) and can be tapped to set/change
- given: a difficulty is tapped
- then: it persists on the set (nullable), and reloading preserves it
- given: a value set via the ▲/▼ arrows
- when: the user then types a value manually (numpad or keyboard)
- then: the typed value overwrites the arrow value, and a later bump adjusts from the
  typed value (was the unplaced *"manual enter should overwrite the upper lower thing"*)
- invariant: weight entry is identical at every site (add form, inline editor, guided)
- invariant: difficulty is always optional — never required to add, complete a set, or
  complete the workout
- invariant: arrows never introduce a fractional value
- invariant: manual entry is authoritative over the arrows — never the reverse

### Steps
1. Add 60×10; the form still shows 60×10 → tap Add again → second 60×10 set (no re-entry)
2. Tap the weight value on a phone → custom numpad opens (no OS keyboard); tap 6,0,
   then .5 → 60.5; delete works; ▲ → 61.5, ▼ → 60.5 (±1)
3. On desktop, click the weight field and type 62.5 with the hardware keyboard → accepted
4. Open the inline editor and the guided setup → the exact same numpad/arrow behaviour
5. Each set row shows a blank 1-5 chip; tap 4 on set #1 → persists; reload → still 4;
   completing the workout with some chips blank is allowed

---

## Tile 11 — DRUH single-set guide (full-screen tempo timer) ✅

Seam: setup sheet (:1794-1852), `startGuided` (:422), `runningDruh`→`DruhTimer`
(:1855, `DruhTimer.tsx`), `handleGuidedStop` (:488), `stopEarlyReps`/`guidedStateAt`
(`guidedTimer.ts`), `openGuidedSetup`/`openGuidedSetupForSet`/`guidedFromEdit`
(:416/:442/:474). Wake lock is session-level (ADR-0007). No field note folds here
directly (the guide notes are on Tile 12), but the setup reps/weight ordering is the
*"weight reps reversed in guide"* note — resolved in Tile 12, flagged here.

A metronome that paces one set and logs the reps you did. **Setup sheet:** Goal reps
+ Weight + a 4-phase Tempo (down/rest/up/hold), Cancel / Start. Reachable from ▶
Guided in the add form, a not-done row's ▶, or the inline editor's ▶ (the last two
carry `targetLocalId` to fill an existing scheduled set). **Running timer:** full-
bleed colour + verb per phase (colourblind-safe), audio tones + haptics, a GET READY
lead-in (skippable), Rep N/goal, and Cancel / Stop & log.

**Feared regression:** you pause mid-set (rack the weight, grind a slow rep) then
tap Stop & log — and because the count is `floor(elapsed ÷ tempo-per-rep)`, the pause
inflates it, logging reps you never did.

**Decision — Stop & log confirms the rep count.** On early stop, the computed
`stopEarlyReps` is shown as an editable value; the user adjusts ± and saves. Accurate
regardless of pacing. Adjusting to 0 logs nothing (existing ≤0 rule). Natural
goal-completion may log the goal directly without the confirm (assumption — confirm).

**Already true (do not re-spec):** Cancel discards and logs nothing; a target set
that gets ≤0 reps stays pending (not wrongly marked done); weight is fixed at the
setup value for the whole run (change it by editing the set afterwards).

VARIANT: the tempo values (PT-prefilled via `ptTempo`, else the global `tempo`,
mirroring Tile 6's rest-target model); audio/haptics on/off; GET READY length; the
per-phase colours/verbs.

### Contract
- given: a guided set is set up (reps, weight, tempo) and Started
- when: the goal reps are reached
- then: the set logs `reps = goal`, `weight = setup weight`, done; rest starts only
  if idle (Tile 6)
- given: a running guided set
- when: Stop & log is tapped early
- then: a confirm/adjust step shows the computed completed reps; on save the set logs
  the confirmed reps (+ setup weight, done); saving 0 logs nothing
- given: a guided set launched to fill an existing scheduled set (`targetLocalId`)
- when: it stops with ≥1 rep
- then: that specific set is filled (reps/weight/done), not a new one appended
- given: a running guided set
- when: Cancel is tapped
- then: nothing is logged and no set is created or modified
- invariant: a guided set never logs more reps than the user confirms
- invariant: guided-stop obeys the sacred-rest rule — it never resets a running rest
- invariant: Cancel is always a no-op on the set list

### Steps
1. ▶ Guided from the add form → setup → Start → GET READY → phases run; reach goal →
   set logged with goal reps + weight, rest starts (if idle)
2. Start a 10-rep guided set, pause partway, Stop & log at ~6 reps → confirm step
   shows 6 → bump to 5 → set logs 5
3. ▶ on a not-done scheduled set → guide fills THAT set on stop (no duplicate row)
4. Start a guided set with a rest already running → on stop, the running rest is not
   reset (Tile 6)
5. Start guided → Cancel → no set added, nothing changed

---

## Tile 12 — Whole-exercise guide ▶ All (setup + play-through) ✅ ← 2 field notes

Seam: `openGuideSetup` (:545), guide-all setup sheet (:1903-1966), `startGuideAll`
splice (:578-620), `guidingExerciseId`→`ExerciseGuide` (:1969, `ExerciseGuide.tsx`),
`guideSetsFor` (:537), `handleGuideDone` (:624). Folds notes *"weight/reps reversed
in guide"* and *"play mode → come back → first exercise is lost"*.

▶ All guides one exercise end to end, full-screen: a setup sheet (tempo + a per-set
Reps/Weight row list, add/remove) → `ready → set → rest → set …` → on finish/Exit,
actual reps are written and each guided set marked done. The runner has its OWN
internal rest between sets (mode `rest`, `restSeconds = restTarget`), independent of
the sticky rest bar — so it does not interact with the Tile 6 sacred-rest timer.

**Decision — 12a: Weight-first ordering (note: *"weight/reps reversed in guide"*).**
Today both guide setups order **Reps → Weight**, reversed from the add form and set
rows (Weight → Reps). Flip the guide setups (single-set and guide-all) and the GET
READY readout to **Weight → Reps**, so ordering is identical across the whole screen.

**Decision — 12b: Exit must never lose an exercise (note: *"play mode → come back →
first exercise is lost"*).** CONFIRMED bug: play ▶All, tap Exit back to the logging
screen → the first exercise's sets are gone / not logged. Root-cause the
`finish → onDone → handleGuideDone` write (suspected stale `localSets` snapshot from
guide mount clobbering newer state). The pinned invariant: exiting the guide by any
path preserves every exercise and every set; completed sets are logged, uncompleted
sets stay as they were.

**Decision — rep confirm (from Tile 11), batched.** Rather than interrupting each
set with a confirm dialog, the guide-all shows a single end-of-guide review of the
per-set reps (editable) before committing, so the set→rest→set flow stays hands-free.

VARIANT: tempo values (PT-prefill else global, per Tile 6 model); the guide's own
rest length (= global `restTarget` today); audio/haptics; per-phase colours.

### Contract
- given: an exercise with sets, ▶ All tapped
- when: the setup sheet opens
- then: each set row shows Weight then Reps (matching the rest of the app), plus the
  shared tempo; rows can be added/removed (never below one)
- given: the guide is running
- when: each set completes (goal reached or Stop set & rest)
- then: it advances set → rest → next set, staying full-screen; a stray tap cannot
  end a set (only the explicit button)
- given: the guide finishes or Exit is tapped
- when: control returns to the logging screen
- then: EVERY exercise and its sets are still present; the guided exercise's completed
  sets are logged (actual reps, done); nothing from other exercises is altered
- given: the end-of-guide rep review
- when: the user adjusts a set's reps and confirms
- then: the adjusted reps are what get logged
- invariant: exiting the whole-exercise guide never deletes or drops any exercise or set
- invariant: weight/reps ordering is identical everywhere, including both guide setups
- invariant: the guide's internal rest never touches the sticky rest bar's timer (Tile 6)

### Steps
1. Workout with exercises A (first), B, C; ▶ All on B → guide B → Exit → A, B, C all
   still present; B's completed sets logged (THIS is the bug repro — must pass)
2. Open the guide-all setup → each row reads Weight then Reps (not reversed)
3. Guide a 3-set exercise to completion → end-of-guide review lists 3 rep counts →
   adjust set 2 → logged reps reflect the adjustment
4. During the guide, the sticky rest bar's separate running timer (if any) is untouched
5. Exit mid-first-set (before any set completes) → no exercise lost; nothing wrongly
   marked done

---

## Tile 13 — Footer / terminal actions (Import · Paste · Complete/Done) ✅

Seam: Import (`handleOpenImport`/`handleImportTemplate` :689/:699, `expandTemplate`),
Paste (`handlePasteRequest`/`applyPaste` :788/:796 — same seam as Tile 4), Save
(`handleSaveProgress` :748), Done (`handleComplete` :767, `buildPayload` :744,
`completeWorkout`). The Copy/Save/Done buttons live in the header; Load-template +
Paste are inline below the set list.

The workout-level terminal actions: bring sets IN (Import a template, Paste a copied
workout) and take the workout OUT (Complete/Done).

**Decision — 13a: Import matches Paste.** Loading a template into a NON-empty workout
must not silently replace it (today `handleImportTemplate` does exactly that). Give it
the same rule as paste (Tile 4): empty → import directly; non-empty → **Overwrite /
Append / cancel**, reusing the same prompt. Append expands the template's sets after
the existing ones.

**Decision — 13b: Complete keeps every set.** Done logs all sets regardless of ✓
state (confirmed, unchanged). A not-done set — including one auto-committed from a
typed-but-unticked value (Tile 9) — is logged as part of the finished workout; the
done flag is a live-logging aid, not a filter on what gets saved.

**Cross-refs (already pinned, not re-spec'd here):**
- Paste per-set fidelity + Overwrite/Append is Tile 4 (and its clipboard-model refactor).
- Complete must be blocked while the save queue is dirty/errored, with auto-retry —
  Tile 5. Done must never navigate away over a failed final save.

### Contract
- given: a workout that already has sets
- when: Load template is chosen
- then: an Overwrite / Append / cancel prompt appears (identical to paste); no set
  list is replaced without an explicit Overwrite
- given: an empty workout
- when: Load template (or Paste) is invoked
- then: the sets are brought in directly, no prompt
- given: a workout with some unchecked (not-done) sets
- when: Done is tapped (and the save queue is clean — Tile 5)
- then: the workout completes with ALL sets logged, checked or not
- invariant: neither Import nor Paste ever destroys existing sets without an explicit
  Overwrite choice
- invariant: what gets logged on Complete does not depend on any set's ✓ state

### Steps
1. Workout with a warm-up set → Load template → Overwrite/Append/cancel; Append →
   warm-up kept, template sets after; Overwrite → warm-up replaced
2. Empty workout → Load template → sets appear directly, no prompt
3. Log 3 sets, tick only 2, tap Done → all 3 are in the completed workout
4. Trigger a save error, tap Done → refused until the save recovers (Tile 5), never a
   silent completion over unsaved data

---

## Tile 14 — Completed (read-only) view ✅ (reuses tiles above)

Seam: `status === 'completed' && !isEditing` branch (:965-1134). Header: Back →
dashboard, "Completed" + date, distance-unit toggle (cardio; Tile 3), Copy, Edit.
Body: per-exercise groups with the Tile 7 reference affordances (ⓘ / ◷ / 🏆 / best·60)
and set rows rendered read-only (no ✓ toggle, no edit, no delete, no add, no guide).

A faithful, non-editable record of a finished workout. Everything here is a re-use of
tiles already pinned, in display-only form.

### Contract
- given: a completed workout, not in edit mode
- when: the view renders
- then: sets are shown read-only; there is no affordance to add/edit/delete/complete/
  guide a set from this view
- given: the read-only view
- when: ⓘ / ◷ / 🏆 / best·60 or Copy is used
- then: they behave exactly as Tile 7 (reference) / Tile 4 (lossless Copy) — reads
  only, never mutating this workout
- when: Edit is tapped
- then: the view switches to the editable active screen (Tile 15)
- invariant: the completed view never mutates the workout except by entering Edit
- invariant: difficulty chips (Tile 10c) and rest lines render here read-only

### Steps
1. Open a completed workout → set rows show values with no ✓/edit/✕ controls
2. Tap 🏆 / ◷ → reference modals open (Tile 7); the workout is unchanged
3. Copy → clipboard holds the exact per-set list (Tile 4); nothing here changes

---

## Tile 15 — Editing a completed workout ✅ (reuses tiles above)

Seam: `isEditing` (:101), Edit entry (:998), the active render reused for
`completed && isEditing`, `handleBack` discard branch (:709-711), discard prompt
(:1724-1748), `handleComplete`→`completeWorkoutCore` (`cores.ts:293`, status-only).

Tapping Edit re-enters the full active logging screen — every tile is live again
(add, edit, delete, reorder, guide, rest, copy, paste, import). Done re-saves and
returns the workout to completed.

**Verified invariant — the date is preserved.** `completeWorkoutCore` updates only
`status: 'completed'`; it never rewrites `date`. Re-completing an edited historical
workout keeps its original calendar date.

**Decision — snapshot + revertable discard.** Entering Edit captures a pre-edit
snapshot. Changes autosave live (same never-lose-data model as an active workout), so
nothing is lost mid-edit. **Save/Done** keeps the changes and re-completes. **Back →
Discard** restores the captured snapshot — reverting *all* edits, including ones that
already autosaved — so a historical record is never silently, partially altered.

VARIANT: the header should read "Editing" (not "Active") while editing a completed
workout.

### Contract
- given: a completed workout
- when: Edit is tapped
- then: the full editable screen opens and a pre-edit snapshot of the sets is captured
- given: edits are made while editing a completed workout
- when: any change happens
- then: it autosaves live (no data lost mid-edit)
- given: edits in progress
- when: Done/Save edits is tapped
- then: the changes persist and the workout stays completed with its ORIGINAL date
- given: edits in progress
- when: Back → Discard is chosen
- then: the pre-edit snapshot is restored and persisted; the workout returns to exactly
  its pre-edit state
- invariant: editing a completed workout never changes its date or its completed status
- invariant: Discard fully reverts every edit made in the session, autosaved or not

### Steps
1. Edit a completed workout dated last week → change a weight → Done → still dated last
   week, still completed, new weight saved
2. Edit → add a set, tick another → Back → Discard → the added/ticked changes are gone;
   the workout matches its pre-edit state
3. While editing, the header reads "Editing" (not "Active")
