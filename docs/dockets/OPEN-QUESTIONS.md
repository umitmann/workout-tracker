# Open questions — resolve before/at final integration

Assumptions pinned during the interview that the maintainer should confirm. Each has a
sensible default already baked into its docket; changing the answer is a small,
localized edit. None block starting the implementation.

## Q1 — Difficulty scale direction & labels (D3, Tile 10c)
Pinned default: **1 = easy … 5 = maximal effort.** Storage is scale-agnostic (a
`smallint`), so this is a UI-label decision only. Confirm direction and whether to show
words (easy/moderate/hard/very hard/max) or just numbers.

## Q2 — Difficulty on cardio? (D3, Tile 10c)
Pinned default: **chip on strength (weight/reps) sets only, not cardio** ("how heavy it
was" doesn't map to cardio). Confirm, or extend to cardio with a different prompt.

## Q3 — Guided natural-completion rep confirm (D9, Tile 11)
Pinned default: the rep **confirm/adjust** step appears on **early Stop & log**;
reaching the goal naturally logs the goal directly **without** a confirm. Confirm, or
require the confirm on natural completion too (elapsed can still drift if the lifter
fell behind the metronome).

## Q4 — Guide-all rep review placement (D9, Tile 12)
Pinned default: a **single end-of-guide review** of all sets' reps (not a per-set
prompt), to keep the set→rest→set flow hands-free. Confirm this is the right moment.

## Q5 — Numpad key layout details (D2, Tile 10b)
Pinned as a build-time detail: beyond digits 0-9 / delete / .25 / .5 / .75, the pad
needs a done/close key and (for weight) possibly a decimal point. Confirm the final key
set / layout when reviewing D2.

## Q6 — "Editing" vs "Active" header label (D10, Tile 15)
Pinned default: while editing a completed workout the header reads **"Editing"** (today
it says "Active"). Trivial — confirm the exact word.

## Residual gaps surfaced DURING implementation (verify in real use)
All ten dockets are green on `tsc` + the unit suite (538 tests) + `npm run build`, but
the unit suite covers the **pure helpers**, not the React wiring. These want a real
browser session:

- **R1 — Calendar-popup copy is still lossy (D8).** Copy from the *logging screen* is
  now lossless per-set (Tile 4). But the calendar popup's copy sources the aggregated
  month-preview query (`fetchWorkoutPreview`), which only carries a set count — so it
  still expands to N identical sets. Fixing it means changing that data source; out of
  D8's scope. Flagged with a `NOTE:` in `CalendarView.tsx`.
- **R2 — Auto-commit invocation timing (D7).** `autoCommitAddForm` is wired both to the
  add-form's `onBlur` AND called explicitly from `handleSelectExercise`/change/back. On
  a tap-away both can fire in one event; because it commits via a direct
  `setLocalSets(value)` (last-write-wins) this should still yield exactly ONE not-done
  set, not a duplicate. Confirm no duplicate row appears when you type a value then tap
  another exercise.
- **R3 — Playwright suites not executed.** `test:modal-a11y` / `test:touch-targets`
  need a running dev server + auth fixture. `test_modal-a11y.mjs` WAS updated for
  D10's new Back sheet (Leave → Delete → confirm) but has not been run.
- **R4 — Numpad on a real device.** Touch detection uses `matchMedia('(pointer: coarse)')`;
  OS-keyboard suppression (`readOnly` + `inputMode="none"`) is unverified on an actual phone.

## Deferred (not an open question, needs its own pass)
- **Tile 3 — distance-unit toggle (km/m) + cardio set-row display.** The only
  un-interviewed piece. Run a dedicated cardio clarify-scenario pass, then docket it.

## Downstream / future (out of scope for these dockets)
- Difficulty (D3) surfacing in exercise history & PT export report.
- PT rest-target (D4) surfacing/editing UX beyond the TemplateEditor control.
