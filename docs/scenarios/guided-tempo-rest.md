# Scenario: Guided (DRUH) sets, whole-exercise guide, and rest

## Intent
An athlete can perform a set under a prescribed tempo (DRUH = Down / Rest / Up /
Hold) with a full-screen, glanceable timer, log the actual reps, and rest between
sets — solo or as a coach-driven plan. The trainer (PT) can prescribe the tempo
and per-set targets (including dropsets) on the template; the athlete sees them
on the logging screen and can run each set guided, run the whole exercise guided,
or just complete sets manually. Everything is designed to be usable mid-lift:
big type, whole-second countdowns, audio/haptic cues, a screen that won't sleep,
and deliberate (not accidental) controls.

Pure view-models: `src/lib/tempo.ts`, `src/lib/guidedTimer.ts`, `src/lib/restTimer.ts`.
Unit tests: `.claude/test_tempo.mjs`, `.claude/test_guided-timer.mjs`.
E2E smoke: `.claude/test_guided-set-rest.mjs`.

## Contract — DRUH timer (single set: ▶ Guided / per-set ▶)
- given: an exercise with a tempo (e.g. 3-1-2-1) and a goal rep count
- when: a guided set is started
- then: a **GET READY** countdown runs first for `READY_SECONDS` (5s), whole
  seconds counting down, with a per-second tick; a "Start now" button skips it
- then: the timer runs full-screen, one background colour per phase, with a big
  **action verb** (LOWER / HOLD / LIFT / HOLD), a directional symbol (↓ / ⏸ / ↑),
  a **whole-second** countdown (never fractional), and the rep counter
- invariant: audio can be toggled on/off; a distinct tone marks each phase change
  and the final 3 seconds tick
- when: the goal reps are reached → the timer auto-stops and logs the goal reps
- when: "Stop & log" is tapped early → only fully completed reps are logged
- invariant: the screen stays awake for the whole timer (Wake Lock)

## Contract — Whole-exercise guide (▶ All)
- given: an exercise with N sets (each a goal reps + weight)
- when: ▶ All is tapped → a **setup screen** shows the tempo and every set's
  reps/weight as steppers, and lets you add/remove sets; Start launches the guide
- then: the guide runs full-screen as GET READY → set → rest → GET READY → set …
  staying on the play screen; it never returns to the list mid-exercise
- invariant: stopping a set is a **deliberate button press** ("Stop set & rest"),
  never a stray screen tap; rest and ready have "Skip rest" / "Start now" buttons
- when: the last set finishes (or Exit) → each set's actual reps are written and
  the sets are marked done
- invariant: the screen stays awake throughout

## Contract — Rest timer (docked, sticky at top)
- given: a set is completed (manual ✓, plain Add, guided stop, or "Complete" from
  the editor)
- then: a rest timer starts automatically for that set (strength only — not cardio)
- invariant: **every** rest start resets from 0 — it never continues a previous
  rest, even for the same set (keyed on an incrementing nonce)
- given: fixed mode → counts down from the target, alerts at zero, then shows
  overtime; variable mode → counts up
- invariant: the target is adjustable live in ±5s steps (floor 5s); mode and
  target are settable **any time** from the sticky Rest bar, not only after a set
- invariant: the recorded rest is the **actual** elapsed seconds (`sets.rest_seconds`)
- invariant: the sticky Rest bar drops out of sticky positioning while a field is
  focused, so the on-screen keyboard doesn't shove it around
- invariant: tempo, rest mode, and rest target persist (localStorage) across
  exercises and reloads

## Contract — PT-prescribed tempo & per-set targets
- given: a PT sets a tempo and/or per-set targets (dropset) on a template exercise
  (`routine_exercises.tempo`, `routine_exercises.set_details`)
- when: the athlete starts a workout from that template
- then: the scheduled sets appear as pending rows with their target weight/reps
- then: opening any guided flow for that exercise pre-fills the PT's tempo
  (athlete may still adjust)

## Contract — completing a set from the weight-rep editor
- given: a set row is open in the inline weight-rep editor
- when: **✓ Complete** is tapped
- then: the typed weight/reps are saved, the set is marked done, rest starts, and
  the set stays visible (the row does not disappear)

## Steps (happy path)
1. PT builds a template: adds an exercise, sets tempo 3-1-2-1, and a dropset
   (e.g. 8×60 → 8×50 → 8×40). Saves.
2. Athlete starts the workout → three pending set rows show 60/50/40.
3. Tap ▶ All → setup shows tempo + the three sets → Start.
4. GET READY 5-4-3-2-1 → LOWER/HOLD/LIFT/HOLD with whole-second counts → the set
   auto-stops at the goal (or Stop set & rest early) → REST countdown → next set.
5. After the last set, reps are logged and the sets are marked done.
6. Between sets the athlete can change rest to Variable or ±5s from the sticky bar.
7. Screen never sleeps; a stray tap never ends a set.
