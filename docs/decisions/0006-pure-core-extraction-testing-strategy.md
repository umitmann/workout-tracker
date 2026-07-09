# ADR-0006: Testing strategy — extract pure cores; fake the Supabase client for actions

**Status:** Proposed
**Date:** 2026-07-09
**Source:** [Quality survey 2026-07-09](../quality-survey-2026-07-09.md) findings H3, H4, M9, M12; coverage map

## Context
Coverage today is bimodal. The pure lib modules (tempo, guidedTimer, restTimer,
buildReport, muscleGroups, filterExercises) are well tested via `node --test` (54
passing tests). Everything else is untested:

- **All 8 server-action files** — the only DB write paths, each re-implementing
  auth + ownership guards, one of which fronts a destructive delete-then-insert.
- **dal.ts (577 lines)** — best-session selection with reps-only fallback, 60-day
  windows, history aggregation, month previews: subtle branch logic driving checklist
  §5 and §7.
- **WorkoutLogger.tsx (1 870 lines)** — autosave sequencing, rest recording, set
  edit/revert, reorder, template/clipboard expansion (duplicated twice in the file),
  and the §2 data-source invariants guarded by a single line (l.115).

The three Playwright suites cannot close this gap: they require a dev server plus live
Supabase auth via interactive setup, so they never run in CI. The manual behaviour
checklist (~200 rows) is the de-facto regression suite.

## Decision
Testing follows a **pure-core extraction** strategy — the pattern already proven by
tempo/guidedTimer/restTimer:

1. **Client logic:** stateful logic in components is extracted into pure modules under
   `src/lib/` taking plain data in and out, unit-tested with `node --test`:
   - `setListOps.ts` — add/delete/edit-revert/reorder/record-rest over `LocalSet[]`.
   - `expandTemplate.ts` — the single template/clipboard → set-rows expansion
     (deduplicating the two copies in WorkoutLogger).
   - `deriveInitialSets.ts` — the workout+template → initial state matrix that
     enforces checklist §2 (completed never falls back to template).
   Components stay thin callers; behaviour tests target the module, not the DOM.
2. **Server actions and DAL:** tested with a **fake Supabase client** (a hand-rolled
   recording stub in `.claude/fakes/`, no new dependencies). Action bodies live in a
   non-`'use server'` module (`src/app/actions/cores.ts`) taking the client as an
   explicit first parameter; the exported `'use server'` actions are thin wrappers
   with unchanged signatures, so the test seam never appears on the POST-reachable
   server-action boundary. Tests assert the *contract*:
   no user → error + zero mutations; ownership miss → error + no delete/insert fired;
   invalid numeric input → rejected. Pure transformation cores inside dal.ts
   (best-session selection, history aggregation, month previews) are extracted and
   tested on plain arrays, like the client logic.
3. **Playwright remains the top of the pyramid,** reserved for genuine integration
   behaviours (reload-persistence, beforeunload, focus/scroll). Making those suites
   CI-runnable (seeded ephemeral Supabase or route mocking) is a separate
   infrastructure work packet — it must not block the unit-level coverage above.
4. **Every checklist row gets a designated layer.** The test plan
   ([test-plan.md](../test-plan.md)) maps behaviour-checklist sections to unit vs
   Playwright coverage; new features add their row and test together.

## Consequences
- **Positive:** the highest-risk logic becomes testable without infrastructure; CI can
  gate on `test:unit` today; extraction also removes the WorkoutLogger duplication and
  shrinks the 1 870-line component.
- **Negative:** extraction is refactoring risk in itself — it must be done
  test-first (write the test against the intended pure API, then move the code) and
  verified against the existing Playwright suites where runnable.
- **Convention:** new tests follow the existing pattern — `.claude/test_<topic>.mjs`,
  wired into `test:unit` when pure.

## Alternatives considered
- **Component testing (Testing Library / JSDOM) against WorkoutLogger directly** —
  rejected as primary strategy: adds a dependency stack, couples tests to markup, and
  the riskiest logic (persistence ordering, expansion, invariants) is data logic, not
  rendering.
- **Full E2E coverage via CI-run Playwright first** — rejected as first step: blocked
  on seeded-Supabase infrastructure; unit extraction delivers coverage of the same
  invariants immediately.
- **Mocking `@supabase/supabase-js` at module level (vi.mock-style)** — rejected: no
  test framework with module mocking is in the repo; a plain injected/recording fake
  keeps `node --test` sufficient.
