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
- 🔶 Tile 6 — Rest bar. Sacred-running-timer rule pinned (notes #1, #2). **OPEN
  QUESTION left off here:** should the rest target be one global value (today) or
  remembered per-exercise? Decide, then continue down the screen.

### Remaining tiles to interview (top → bottom)
- Tile 7 — Exercise group header: name, info(i), last(◷), best(🏆), best·60
- Tile 8 — Exercise controls row: reorder ↑↓, ▶ All (guide whole exercise), quick-add +
- Tile 9 — Set rows: #, weight/reps or duration/distance, done ✓, edit, delete ✕
  · folds field note: *"if I don't hit complete, the value is removed when tapping elsewhere"*
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

VARIANT (stays configurable): Fixed vs Variable mode; the target seconds (±5s);
which set manual Start rest attaches to (currently the last set).

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
- invariant: no implicit action ever resets or re-points a running rest timer
- invariant: rest elapsed is always logged to the set the timer was started for
- invariant: cardio set completion never starts a rest (unchanged, `startsRestOnComplete`)

### Steps
1. Complete set 1 → rest starts. At ~0:45 complete set 2 → rest STILL at 0:45+,
   still counting, not reset
2. Tap Done on that rest → 0:45+ logged to set 1; set 2 shows no rest row
3. Start a rest; add a new set, then delete a different set → rest keeps running
   untouched
4. While a rest runs, tap the explicit "Start rest" button → old elapsed logged,
   new timer at 0:00
