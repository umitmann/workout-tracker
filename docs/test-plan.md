# Test Plan — Quality Survey Remediation (2026-07-09)

Companion to [quality-survey-2026-07-09.md](quality-survey-2026-07-09.md) and
ADRs [0004](decisions/0004-atomic-workout-persistence.md)–[0008](decisions/0008-modal-a11y-touch-target-baseline.md).
Each work packet (WP) below is a self-contained TDD task for one implementation agent.

## Rules for every work packet (read first, non-negotiable)

1. **TDD, strictly.** Write the RED tests first, run them, confirm they fail for the
   *right reason*, then implement until green, then refactor. Do not write
   implementation before a failing test exists.
2. **This is Next.js 16 — your training data is stale.** Read the relevant guide in
   `node_modules/next/dist/docs/` before touching any Next.js API (per AGENTS.md).
3. **Test conventions:** pure tests are `node --test` files at `.claude/test_<topic>.mjs`,
   added to the `test:unit` script in package.json. Playwright tests follow the pattern
   in `.claude/verify_checklist.mjs` (they require a dev server + `.claude/auth.json`;
   they are written and left runnable, not required to pass in CI yet — see WP-17).
4. **Never break existing tests.** `npm run test:unit && npm run test:filters`
   (54 tests) must pass before and after your change.
5. **Behaviour checklist is the spec.** If your packet changes user-visible behaviour,
   update the matching rows in `docs/behaviour-checklist.md`.
6. **Preserve the known gotchas** listed at the bottom of the behaviour checklist
   (UUID routine ids, template-never-written-to-DB, completed-never-falls-back, etc.).
7. **Scope discipline:** implement only your packet. If you discover an adjacent bug,
   note it in your final report; do not fix it.

## Dependency order

```
Phase 0 (enablers):   WP-01 → WP-05      WP-02 → WP-04, WP-10      WP-03
Phase 1 (critical):   WP-04, WP-05, WP-06
Phase 2 (high):       WP-07, WP-08, WP-09
Phase 3 (medium/low): WP-10 … WP-18      WP-17 (infra) any time
```

Packets within a phase are independent and parallelizable unless an arrow above says
otherwise.

---

## Phase 0 — Test infrastructure & extraction (enablers)

### WP-01 · Fake Supabase client + first server-action guard tests
**Findings H3 · ADR-0006 · Blocks WP-05**

Build `.claude/fakes/supabase.mjs`: a hand-rolled recording fake of the Supabase
client surface used by the actions (`auth.getUser`, `from().select/insert/update/delete`
chains, `.eq/.single`), configurable per-test (user present/absent, ownership select
returns row/null, insert resolves/rejects) and recording every mutation call.
Server actions must become testable against it — inject the client (e.g. optional
param defaulting to `createServerSupabaseClient()`) rather than module-mocking.

**RED** (`.claude/test_action-guards.mjs`, node:test):
- `saveWorkoutProgress` with no user → returns `{error:'Unauthorized'}`, fake records
  **zero** `delete`/`insert` calls.
- `saveWorkoutProgress` where the ownership select returns null → `{error:'Not found'}`,
  zero mutations.
- `completeWorkout` under both conditions → never updates `status`.
- Same no-user/no-ownership matrix for `addSet` and `saveTemplateExercises`
  (`delete().eq('routine_id')` never fires on guard failure).

**GREEN:** actions accept an injected client; guards verified; all existing behaviour
unchanged (`redirect` paths still redirect).

### WP-02 · Extract WorkoutLogger pure cores: setListOps, expandTemplate, deriveInitialSets
**Findings H4, M9 · ADR-0006 · Blocks WP-04, WP-10**

Extract from `src/app/workout/[id]/WorkoutLogger.tsx` into pure modules in `src/lib/`,
then make WorkoutLogger a thin caller. Pure functions over plain data; no React.

**RED** (`.claude/test_set-list-ops.mjs`, `.claude/test_expand-template.mjs`,
`.claude/test_derive-initial-sets.mjs`):
- `setListOps`: `addSet` appends within the exercise group; `deleteSet` removes only
  the target `localId`; `applyEdit` updates only the target and `cancelEdit` reverts to
  prior values (checklist §4.3–4.5); `reorderExercise` moves an exercise's contiguous
  set block up/down keeping internal order, no-ops at list edges (§4.11–4.13);
  `recordRestForSet` attaches elapsed seconds to the preceding set's `rest_seconds`
  (§17.3/§17.5 — *actual elapsed*, not configured target).
- `expandTemplate`: exercise with `set_details=[{w:10,r:8},{w:9,r:12}]` → 2 rows in
  order; `set_details=null, sets=3` → 3 uniform rows; cardio exercise carries
  duration/distance with null weight/reps. **One** implementation used by both the
  initializer (~l.121) and `handleImportTemplate` (~l.684) — delete the duplicate.
- `deriveInitialSets` (the §2 invariant matrix): `{status:'completed', sets:[]}` +
  template → `[]` (never template, §2.5); `{status:'in_progress', sets:[]}` + template
  → expanded template (§2.2); `{status:'in_progress', sets:[…]}` + template → from
  sets, template ignored (§2.3/§2.8).

**GREEN:** modules in `test:unit`; WorkoutLogger imports them; no behaviour change —
existing Playwright suites still pass if run.

### WP-03 · Extract dal.ts pure cores: best-session, history aggregation, month previews
**Finding H3 · ADR-0006**

Extract the transformation logic out of the DB fetches in `src/lib/dal.ts` into pure
functions taking plain arrays (e.g. `selectBestSession(sets, workouts)`,
`aggregateHistory(sets, dateById)`, `buildPreviews(workouts, setsByWorkout)`).

**RED** (`.claude/test_dal-cores.mjs`):
- `selectBestSession`: sets `[{w:100},{w:50},{w:null}]` across two workouts → workout
  containing 100 (§7.5); all-null weights → most recent workout (reps-only/bodyweight
  fallback); empty → null; 60-day-window variant returns null when the window is empty
  even though all-time data exists (§7.8).
- `aggregateHistory`: two sets same date `{w:60,r:10}` + `{w:65,r:8}` →
  `{maxWeight:65, maxReps:10, totalVolume:1120}`; reps-only sets → `maxWeight:null`
  (drives §5.8 weight-only chart).
- `buildPreviews`: planned workouts get **no** preview (§10.6); per-exercise name +
  set-count grouping for completed/in-progress.

**GREEN:** dal functions delegate to the cores; cores in `test:unit`.

---

## Phase 1 — Critical

### WP-04 · Atomic, serialized, surfaced persistence
**Findings C1, C2, H1, M8 · ADR-0004 · Depends on WP-02**

Implement ADR-0004: RPC transaction for snapshot save, client-side per-workout save
queue, result checking at every call site, aria-live "not saved" state + retry, dirty
indicator for local-only edits/deletes. Includes the SQL migration (document it in
`docs/database.md` per that file's convention).

**RED:**
- Node (with WP-01 fake): insert rejects → action returns `{error}` **and** no delete
  was issued before a guaranteed insert (assert call order/atomicity at the fake:
  the failing path must not leave "delete recorded, insert failed").
  `insertSets` no longer swallows non-missing-column errors.
- Node (pure, save queue extracted per ADR-0006): two saves enqueued concurrently
  execute sequentially; final persisted snapshot equals the **later** one; a queued
  save coalesces to latest state.
- Node (dirty tracking): inline edit sets dirty; successful persist clears it; failed
  persist leaves it set.
- Playwright (`.claude/test_autosave-resilience.mjs`): (a) add 3 sets rapidly,
  reload → all 3 present, in order (§15.3); (b) route-intercept the save action to
  fail, add a set → visible error/unsaved indicator appears, beforeunload guard armed;
  (c) "Done" with failing save → stays on logger with error, does **not** redirect.

**GREEN:** all above pass; §15.1–15.3 hold; no silent-failure path remains
(grep: every `saveWorkoutProgress`/`completeWorkout` call site inspects the result).

### WP-05 · Server-action input validation + remaining guard coverage
**Findings M7, L7, H3 · ADR-0006 · Depends on WP-01**

**RED** (`.claude/test_action-validation.mjs`):
- `saveWorkoutProgress`/`addSet` with `weight:NaN`, `reps:-5`, `duration_minutes:Infinity`
  → rejected (or coerced to null per field semantics — match `logBodyWeight`'s
  `Number.isFinite && > 0` convention at `bodyweight.ts:24`); nothing persisted.
- Valid payloads still persist unchanged (no regression on nulls: null weight/reps are
  legitimate, §4.7/§4.8).
- Guard matrix from WP-01 extended to `notes.ts`, `bodyweight.ts`, `reports.ts`
  (`exportReport` grouping/ordering asserted: workouts grouped by date ascending,
  exercises in insertion order).

**GREEN:** shared `validateSet()` applied in `addSet` and `insertSets`; all action
files covered by at least the no-user/no-ownership tests.

### WP-06 · Local dates everywhere
**Finding H2 · ADR-0005**

Implement ADR-0005: `localDateStr()` helper; client passes explicit dates; ban
`toISOString().split('T')[0]` for calendar dates (all nine call sites listed in the
ADR).

**RED** (`.claude/test_local-date.mjs`):
- `localDateStr(new Date(2026, 6, 8, 23, 30))` → `'2026-07-08'` regardless of `TZ`
  (run the test file under `TZ=America/Los_Angeles` and `TZ=Pacific/Auckland` — add
  both invocations to the npm script or spawn subprocesses in the test).
- Zero-padding: Jan 5 → `'2026-01-05'`.
- CalendarView cell classification uses the local today (extract the
  `isFuture/isPast/isToday` decision into a pure helper and assert the 11:30 pm
  UTC-7 case marks the local day as today, not tomorrow).

**GREEN:** grep shows no remaining `toISOString().split('T')[0]` in `src/` for
calendar-date purposes; server actions receive explicit dates; behaviour-checklist §3
gotchas still hold.

---

## Phase 2 — High

### WP-07 · Wake lock session scope
**Findings H5, L6 · ADR-0007**

**RED** (`.claude/test_wake-lock.mjs`, node:test with a fake `navigator.wakeLock`
spy — test the hook's core by extracting its acquire/release/re-acquire state logic,
or via a minimal React-free harness):
- `active:true` → `request('screen')` called once.
- visibility hidden → visible while active → re-requested.
- `active:false` / teardown → released; no request when API absent (no throw).
- WorkoutLogger engages the lock for `status !== 'completed'` and not for completed
  (assert at whatever seam WP-02 left — e.g. a prop/derived flag — or via Playwright
  checking the hook's DOM-observable side effect if one is added).

**GREEN:** lock held during docked rest and plain logging; per-timer `useWakeLock(true)`
calls removed from DruhTimer/ExerciseGuide; guided scenario invariant now pinned.

### WP-08 · Shared Modal primitive + migrate all overlays
**Finding H6 · ADR-0008**

**RED** (Playwright `.claude/test_modal-a11y.mjs` — dialog semantics are DOM
behaviour, so this packet is Playwright-first):
- Open each overlay (info modal, perf modal, picker sheet, abandon confirm):
  `role="dialog"` + `aria-modal="true"` + accessible name present.
- Escape closes; focus lands inside on open; Tab cycles within; focus returns to the
  trigger on close; destructive confirms do **not** close on backdrop click.

**GREEN:** one `Modal` component; all ten overlay sites migrated; §7.11/§11.3/§13.4
(dismissal methods, scroll restoration) unregressed.

### WP-09 · Touch targets + set-delete confirm
**Findings M1, M2 · ADR-0008**

**RED** (Playwright `.claude/test_touch-targets.mjs`):
- `boundingBox()` of every exercise-header icon button (i/clock/trophy/bolt), reorder
  arrows, quick-add, and set-delete ✕ → width ≥ 44 and height ≥ 44.
- Tap ✕ once → set still present, Confirm/Cancel affordance shown (calendar's two-tap
  pattern); Confirm → removed; Cancel → unchanged (mirrors §3.15–3.17 pattern).

**GREEN:** hit areas padded (visual icons may stay small); delete separated from the
guided ▶; behaviour-checklist §4.1/§4.5 rows updated for the confirm step.

---

## Phase 3 — Medium / Low

### WP-10 · Show rest duration on set rows (checklist §17.8/§17.9)
**Finding M3 · Depends on WP-02**
**RED:** unit on the row-formatting helper: set with `rest_seconds:74` renders
`1:14` (reuse `formatClock` from restTimer lib); null → nothing. Playwright: completed
workout with rest data shows it per row.
**GREEN:** completed summary (and active rows where present) display rest.

### WP-11 · Cardio-aware performance modal (checklist §19.8)
**Finding M4**
**RED:** unit on an extracted column-layout decision (`perfModalColumns(sets|category)`
→ duration/distance vs weight/reps); Playwright: trophy on a cardio exercise shows a
Duration column with values, not em-dashes.
**GREEN:** `LastPerfModal` branches like the logger set rows already do.

### WP-12 · Distance unit preference km/m (checklist §19.10/§19.11)
**Finding M5**
**RED:** unit on `formatDistance(value, unit)`: `(5,'km')→'5 km'`, `(400,'m')→'400 m'`;
buildReport respects the unit. Playwright: set preference to metres → set rows,
completed view, and report all show `m`.
**GREEN:** preference persisted (localStorage, consistent with existing persisted
settings), threaded through all three render sites + buildReport.

### WP-13 · Error boundaries
**Finding M6**
**RED:** Playwright: force a render error in the logger (test hook/route) → error UI
with a retry (`reset()`) and a dashboard link renders instead of a blank page.
**GREEN:** `src/app/workout/[id]/error.tsx` + root `global-error.tsx` (read the
Next 16 error-file conventions in `node_modules/next/dist/docs/` first).

### WP-14 · Duplicate-workout guard
**Finding L1**
**RED:** node (WP-01 fake): `startWorkout` twice for the same date → second call
reuses/redirects to the existing empty in_progress workout, only one insert recorded.
**GREEN:** guard in `startWorkout`/`logWorkoutForDate`; start button disabled while
pending.

### WP-15 · Pin buildReport + parseTempo edge cases (pure test additions)
**Findings M10, L5**
**RED:** extend `.claude/test_pt-report.mjs`: workouts empty + 2 bodyweights →
matches `/No workouts/` **and** `/80 kg → 78 kg/`; single weigh-in → `/Bodyweight: 80 kg/`
and no `→`; `fmtDateLong('2026-01-01')` under `TZ=Pacific/Auckland` and
`TZ=America/Los_Angeles` both render Jan 1. Extend `.claude/test_tempo.mjs`:
`parseTempo('1-2-3-Infinity')` → null; `parseTempo('-1-2-3-4')` → null; pin a decision
for `'1.5-2-3-4'` (recommend: accept fractional, since guidedTimer arithmetic handles
it — document the choice in the test).
**GREEN:** tests only; production change allowed solely if the fractional decision is
"reject" (tighten parseTempo).

### WP-16 · Chart legibility
**Finding M11**
**RED:** unit/snapshot on `ExerciseHistoryChart`: data-label font size ≥ 11 CSS px
equivalent at rendered scale; dark-mode reps stroke is not zinc-500; legend text
meets AA (assert class names as proxy); an accessible summary (title/desc or
aria-label) exists.
**GREEN:** §5.2–5.5 visuals unregressed (colors/labels still per checklist).

### WP-17 · CI-runnable behaviour tests (infrastructure)
**Finding M12 · ADR-0006**
**RED:** a CI job definition that boots the app against a seeded ephemeral Supabase
(or route-mocked network) and runs `verify_checklist` headless — the red state is
"job exists and fails for want of fixtures", green is a passing seeded run.
**GREEN:** non-interactive auth bootstrap (no human `setup-auth` step); documented in
README; `test:checklist` runnable from a clean clone + env vars.

### WP-18 · Small UX fixes bundle
**Findings L2, L3, L4**
**RED:** Playwright mobile viewport: with rest running, focus the weight input and
scroll → countdown remains visible (compact fixed pill or conditional sticky). Unit:
typing `2.5` into the weight stepper preserves the value before blur (keep raw string
in state until blur); inputs use `inputMode="decimal"` (weight/distance) and
`"numeric"` (reps/duration). Playwright: `document.title` is the product name.
**GREEN:** all three; keyboard-safe sticky behaviour from commit 91d70ae unregressed.

---

## Suggested agent assignment

Run packets with one Sonnet agent each, phases in order, parallel within a phase
(respect the arrows in the dependency graph). Review each packet's diff before
merging the next phase — Phase 0/1 packets change the seams the later phases build on.
