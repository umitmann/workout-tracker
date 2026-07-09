# Quality Survey — 2026-07-09

Full survey of test gaps, functionality, UX, and UI. Conducted by three independent
reviewers (test coverage, functionality/correctness, UX/UI), findings verified against
source. Architectural decisions arising from this survey are recorded in
[ADR-0004](decisions/0004-atomic-workout-persistence.md) through
[ADR-0008](decisions/0008-modal-a11y-touch-target-baseline.md).
The remediation plan lives in [test-plan.md](test-plan.md) — every finding below maps
to a work packet (WP-xx) there.

**Totals: 28 findings — 2 critical, 6 high, 12 medium, 8 low.**

---

## Coverage map (as of 2026-07-09)

`npm run test:unit` (43 tests) and `npm run test:filters` (11 tests) pass. All existing
coverage is concentrated in the pure lib modules; nothing else is tested.

| Area | Coverage |
|---|---|
| `src/lib` tempo, guidedTimer, restTimer, muscleGroups, filterExercises | **Well covered** (pure `node --test`) |
| `src/lib/buildReport.ts` | Mostly covered — bodyweight-only, single-entry, TZ branches missed |
| `src/lib/dal.ts` (577 lines) | **Zero tests** |
| `src/app/actions/*.ts` (all 8 files) | **Zero tests** — no auth/ownership/validation coverage |
| `src/app/workout/[id]/WorkoutLogger.tsx` (1 870 lines) | One happy-path Playwright assertion (§15.2) |
| `WorkoutClipboardContext.tsx`, `useSwipe.ts` | Zero tests |

Behaviour-checklist sections with **no automated test at all**: §1 workout lifecycle,
§2 set data-source invariants, §3 calendar, §5 history chart, §6 templates,
§8 navigation invariants, §9 copy/paste, §10 day popup, §13 scroll restoration,
§16 technique modes (also unimplemented). Partial: §7, §11, §12, §14, §15, §17.
Covered: §18, §19.

The three Playwright suites (`test:cardio`, `test:guided`, `test:checklist`) require a
running dev server + live Supabase auth (`.claude/auth.json`) and cannot run in CI or a
sandbox — so the entire behaviour-level test surface depends on a human having run
interactive auth setup.

---

## Critical

### C1 — Autosave is a non-atomic DELETE-then-INSERT with no error handling; a network blip mid-workout can silently wipe all logged sets
**Files:** [workouts.ts:159-179](../src/app/actions/workouts.ts#L159-L179), [WorkoutLogger.tsx:362-366](../src/app/workout/[id]/WorkoutLogger.tsx#L362-L366) · **ADR-0004 · WP-04**
`saveWorkoutProgress` deletes all sets for the workout, then inserts the new snapshot.
Neither call is in a transaction and neither result is checked; `insertSets` swallows
non-missing-column errors. If the delete succeeds and the insert fails (dropped
connection, timeout, RLS hiccup), the DB holds **zero** sets. The client `persist()`
fires this fire-and-forget in `startTransition` on every add/toggle/guided-stop and
ignores the returned `{error}`. This is the exact loss the autosave scenario promises
to prevent.

### C2 — Every persistence failure is silent in the UI; user believes sets are saved when they may not be
**Files:** [WorkoutLogger.tsx:362](../src/app/workout/[id]/WorkoutLogger.tsx#L362), plus handleAddSet/toggleDone/completeFromEdit/finishRest/handleSaveProgress · **ADR-0004 · WP-04**
All seven persistence call sites discard the action result. No toast, no retry, no
unsaved indicator (the documented `workout-unsaved-indicator` scenario is not visible
for edits/deletes either). A failed final "Done" shows success behaviour while the DB
is stale.

## High

### H1 — Overlapping autosave transitions race on rapid adds
**Files:** [WorkoutLogger.tsx:362](../src/app/workout/[id]/WorkoutLogger.tsx#L362), [workouts.ts:159](../src/app/actions/workouts.ts#L159) · **ADR-0004 · WP-04**
Every set action launches an unserialized delete-all+insert cycle. Two rapid adds can
interleave (A's insert lands after B's delete), producing a stale or partial snapshot.
Checklist §15.3 ("no set is lost between rapid adds") is unenforced.

### H2 — "Today" and all date boundaries computed in UTC via `toISOString()`
**Files:** [workouts.ts:75,93](../src/app/actions/workouts.ts#L75), [CalendarView.tsx:86](../src/app/workouts/CalendarView.tsx#L86), [TemplateEditor.tsx:58](../src/app/workouts/[id]/TemplateEditor.tsx#L58), [BodyweightCard.tsx:16](../src/app/dashboard/BodyweightCard.tsx#L16), [bodyweight.ts:18](../src/app/actions/bodyweight.ts#L18), [reports.ts:12,22](../src/app/actions/reports.ts#L12), [dal.ts:340,395](../src/lib/dal.ts#L340) · **ADR-0005 · WP-06**
For any user west of UTC, an evening workout is dated *tomorrow*, the calendar
highlights the wrong "today" cell, and past-vs-future cell classification (which
decides log-now vs schedule, checklist §3.3–3.8) flips. History/report windows are off
by a day at boundaries.

### H3 — Server actions and DAL entirely untested (auth guards, ownership checks, destructive delete-then-insert)
**Files:** all of `src/app/actions/`, [dal.ts](../src/lib/dal.ts) · **ADR-0006 · WP-01/03/05**
The only write paths to the DB have no tests. A regression dropping an ownership
filter would let one user mutate another's data — and the delete-then-insert in
save/complete makes that destructive. Trophy/bolt/history selection logic in dal.ts
(best-session, reps-only fallback, 60-day window, month previews) is likewise
unverified.

### H4 — WorkoutLogger core logic untestable and untested
**Files:** [WorkoutLogger.tsx](../src/app/workout/[id]/WorkoutLogger.tsx) · **ADR-0006 · WP-02**
Autosave sequencing, rest-recording (actual-elapsed vs configured), set edit/cancel,
exercise reorder, template/clipboard expansion (duplicated at lines ~121-137 and
~684-706), and the §2 data-source invariants (completed never falls back to template —
a single guard at line 115) are all trapped in component state.

### H5 — Screen sleeps during docked rest timer; wake lock only covers full-screen timers
**Files:** [useWakeLock.ts](../src/app/workout/[id]/useWakeLock.ts), used only in [DruhTimer.tsx:53](../src/app/workout/[id]/DruhTimer.tsx#L53) and [ExerciseGuide.tsx:52](../src/app/workout/[id]/ExerciseGuide.tsx#L52) · **ADR-0007 · WP-07**
The docked rest countdown — the primary rest experience, auto-started after every set —
holds no wake lock, so the phone locks mid-rest and the user unlocks it between every
set.

### H6 — Modal layer has no dialog semantics, focus trap, Escape, or focus restoration
**Files:** [LastPerfModal.tsx](../src/app/workout/[id]/LastPerfModal.tsx), [ExerciseInfoModal.tsx](../src/app/workout/[id]/ExerciseInfoModal.tsx), [ExercisePickerSheet.tsx](../src/app/workout/[id]/ExercisePickerSheet.tsx), 7 inline dialogs in WorkoutLogger · **ADR-0008 · WP-08**
No `role="dialog"`, no `aria-modal`, no keydown handling anywhere in `src`
(grep-confirmed). Screen-reader and keyboard users cannot use or dismiss any overlay,
including the destructive Abandon/Discard/Replace confirms.

## Medium

### M1 — Icon buttons are 20 px, packed four-abreast; delete ✕ has no hit area beside guided ▶
**Files:** [WorkoutLogger.tsx:853-883,1200-1238,1440-1445](../src/app/workout/[id]/WorkoutLogger.tsx#L1200) · **ADR-0008 · WP-09**
All below the 44 px iOS / 24 px WCAG 2.2 minimum; mis-taps mid-workout open wrong
modals or delete sets.

### M2 — Deleting a logged set has no confirmation or undo
**Files:** [WorkoutLogger.tsx:1440,368](../src/app/workout/[id]/WorkoutLogger.tsx#L1440) · **ADR-0008 · WP-09**
Every other destructive action in the app confirms; set delete is instant, and after
the next autosave/Done the data is permanently gone.

### M3 — Rest duration is captured and persisted but never displayed (checklist §17.8/§17.9 unmet)
**Files:** [WorkoutLogger.tsx:1037-1077,1377-1449](../src/app/workout/[id]/WorkoutLogger.tsx#L1037) · **WP-10**

### M4 — Performance-history modal hardcodes Weight/Reps; cardio shows only em-dashes (§19.8 unmet)
**Files:** [LastPerfModal.tsx:56-66](../src/app/workout/[id]/LastPerfModal.tsx#L56) · **WP-11**

### M5 — Distance unit preference (km vs m, §19.10/§19.11) is unimplemented; "km" hardcoded at all render sites
**Files:** [WorkoutLogger.tsx:1055,1410](../src/app/workout/[id]/WorkoutLogger.tsx#L1055), [buildReport.ts:67](../src/lib/buildReport.ts#L67) · **WP-12**

### M6 — No `error.tsx` anywhere; a render/data error mid-workout is a blank screen
**Files:** `src/app/**` (none exist) · **WP-13**

### M7 — Server actions accept unvalidated numeric inputs (NaN/negative weight, reps, duration)
**Files:** [sets.ts:16](../src/app/actions/sets.ts#L16), [workouts.ts:41,159](../src/app/actions/workouts.ts#L41) — contrast [bodyweight.ts:24](../src/app/actions/bodyweight.ts#L24) which validates · **WP-05**

### M8 — No save-state feedback: unsaved inline edits/deletes indistinguishable from autosaved adds
**Files:** [WorkoutLogger.tsx:1134,751](../src/app/workout/[id]/WorkoutLogger.tsx#L1134) · **ADR-0004 · WP-04**

### M9 — Copy/paste clipboard (§9) and calendar day popup (§10) — two feature areas with zero tests; template-expansion logic duplicated
**Files:** [WorkoutClipboardContext.tsx](../src/lib/WorkoutClipboardContext.tsx), [WorkoutLogger.tsx:682-709](../src/app/workout/[id]/WorkoutLogger.tsx#L682) · **ADR-0006 · WP-02**

### M10 — buildReport untested branches: bodyweight-only report, single weigh-in, TZ-pinned date formatting
**Files:** [buildReport.ts:40-52,86-93,130-141](../src/lib/buildReport.ts#L86) · **WP-15**

### M11 — History chart illegible on phone: 8-9 px labels, zinc-500 reps line on near-black, legend fails AA
**Files:** [ExerciseHistoryChart.tsx:84,103,134,142](../src/components/ExerciseHistoryChart.tsx#L103) · **WP-16**

### M12 — Playwright suites unrunnable in CI (live Supabase + interactive auth required)
**Files:** [.claude/verify_checklist.mjs:14-17](../.claude/verify_checklist.mjs#L14), package.json · **ADR-0006 · WP-17**

## Low

### L1 — Duplicate in_progress workouts on double-tap "Start workout"; orphans accumulate
**Files:** [workouts.ts:76,113,127](../src/app/actions/workouts.ts#L76) · **WP-14**

### L2 — Sticky rest bar un-sticks whenever *any* field is focused; countdown scrolls away during set entry
**Files:** [WorkoutLogger.tsx:1155,286-297](../src/app/workout/[id]/WorkoutLogger.tsx#L1155) · **WP-18**

### L3 — Inconsistent numeric keyboards; partial decimals ("2.") snap to 0 while typing weight
**Files:** [WorkoutLogger.tsx:887,1318](../src/app/workout/[id]/WorkoutLogger.tsx#L887), [Stepper.tsx:62-67](../src/app/workout/[id]/Stepper.tsx#L62) · **WP-18**

### L4 — App metadata still "Create Next App"; no theme-color / home-screen metadata
**Files:** [layout.tsx:16-19](../src/app/layout.tsx#L16) · **WP-18**

### L5 — `parseTempo` edge cases unpinned: fractional "1.5-2-3-4" accepted by accident; leading-dash/Infinity rejected by accident
**Files:** [tempo.ts:36-43](../src/lib/tempo.ts#L36) · **WP-15**

### L6 — DRUH/guide wake-lock re-acquire on `visibilitychange` unverified (scenario invariant)
**Files:** [useWakeLock.ts](../src/app/workout/[id]/useWakeLock.ts) · **ADR-0007 · WP-07**

### L7 — `exportReport` grouping/ordering logic itself untested (only downstream buildReport is)
**Files:** [reports.ts](../src/app/actions/reports.ts) · **WP-05**

### L8 — Technique modes (§16) documented in checklist but entirely unimplemented
**Files:** docs/behaviour-checklist.md §16, docs/scenarios/exercise-technique-modes.md · Backlog — either implement or move the section to roadmap; not scheduled in this test plan.

---

## Resolution (2026-07-09)

All 28 findings were remediated the same day via four TDD phases (each work
packet implemented as 3 independent variants, consolidated, then adversarially
reviewed by a 3-reviewer panel; every must-fix from review was applied before
merge). ADRs 0004–0008 are implemented and marked Accepted.

| Phase | Packets | Landed |
|---|---|---|
| 0 — enablers | WP-01/02/03 (fake Supabase + cores pattern, WorkoutLogger pure cores, dal cores) | `9981ef4` |
| 1 — critical | WP-04/05/06 (atomic+serialized+surfaced saves, input validation, local dates) | `1e5a498`, `b27fb73`, `e116be2` |
| 2 — high | WP-07/08/09 (session wake lock, Modal primitive, 44px targets + delete confirm) | `1f6c434`, `b592333` |
| 3 — medium/low | WP-10…WP-18 (rest display, cardio perf modal, km/m pref, error boundaries, duplicate guard, edge pins, chart legibility, CI, UX bundle) | `11d6780`, `8140b50` |

Test suite: **54 → 462** green (`test:unit` + `test:filters`); `tsc --noEmit`
clean; `npm run lint` 0 errors (pre-existing `no-explicit-any` debt in eight
legacy files is scoped to warnings in `eslint.config.mjs` — burn down, don't
extend). CI (`.github/workflows/ci.yml`) gates lint+tsc+unit on every push
with no secrets.

Notable review catches fixed along the way (each found by the adversarial
pass after tests were already green): a fallback delete path that could wipe
a workout's sets when an insert returned no ids; `handleComplete` silently
swallowing transport-level failures; Modal focus-restore scrolling the picker
(§13); the wake lock missing the edit-completed flow; `reset()` boundaries
that couldn't actually retry a failed fetch.

**Still open (out of scope by design):**
- L8 / checklist §16 (technique modes) — documented but unimplemented;
  belongs on the roadmap, not this remediation.
- The Playwright behaviour tier (14 written suites) is authored but not yet
  executing in CI — WP-17 delivered the workflow + non-interactive auth
  bootstrap (`.claude/bootstrap-auth.mjs`, `SUPABASE_TEST_*` env contract);
  running them needs a seeded Supabase instance (human step: set the env
  vars / run the bootstrap once against a test project).
- The `save_workout_sets` SQL migration (docs/database.md Phase 8) is written
  but must be applied in the Supabase SQL editor; until then the tested
  insert-before-delete fallback path is what runs.
- Light-mode weight-series orange fails AA contrast (pre-existing, documented
  in `historyChartLayout.ts`).
