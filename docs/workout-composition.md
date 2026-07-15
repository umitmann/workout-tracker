# Workout composition guide

## Scope

The guide is an optional layer over the existing template editor. It composes one unsaved session, adds only the exercise and prescription the athlete explicitly accepts, and never saves, schedules, starts, removes, or replaces existing work on its own.

The current editor does not load a complete training week. The guide therefore shows an evidence-informed weekly direction but does not claim that one draft proves adequate weekly frequency or volume. The pure engine can analyze multiple sessions when that data is supplied in a future planner integration.

## Decision model

The flow keeps these concerns separate:

1. Primary goal: general health, hypertrophy, strength, or return to training.
2. Training emphasis: resistance plus separate aerobic work, hypertrophy, or strength.
3. Weekly structure: full body for one to three available days; upper/lower from four days.
4. Current session role: full body, upper body, or lower body.
5. Session budget: time and a soft exercise-count range.
6. Highest-priority composition gap: one movement pattern at a time.
7. Candidate choice: one to three deterministic, equipment-appropriate exercises.
8. Prescription: exact sets/reps/rest added to the draft, with the underlying rep range shown.

The baseline movement roles are knee dominant, hip hinge, horizontal/vertical push, horizontal/vertical pull, unilateral lower body, and trunk. Suggestions exclude exact duplicates, selected variation families, unavailable equipment, rejected exercises, skipped movements, and advanced-skill candidates for beginners.

## Prescriptions

| Goal | Default prescription | Weekly direction |
| --- | --- | --- |
| General health | 2 sets, 8–12 reps, 60–120s rest | Major muscles at least twice weekly; aerobic work remains separate |
| Hypertrophy | 3 sets, 6–15 reps, 60–120s rest | Start around 10 effective weekly sets per major muscle |
| Strength | 3 sets, 3–6 reps, 120–240s rest | Repeated practice with heavier work and longer recovery |
| Return to training | 2 sets, 8–12 reps, 60–120s rest | Begin simply and increase volume gradually |

These are starting points for generally healthy adults, not rehabilitation or individualized medical advice. The interface says so directly and never automates pain/injury decisions.

## Explainability and catalog metadata

The ranking policy is local, pure, deterministic, and unit-tested. Every card names the gap it fills, the equipment match, and the prescription. Stable score and exercise-id tie-breakers prevent cards from changing order between renders.

The engine accepts explicit `movement_patterns`, `variation_family`, `skill_level`, and `compound` catalog fields. The current catalog RPC does not yet return those fields, so legacy rows use a bounded name-and-muscle classifier. Unknown equipment never defaults to bodyweight, and the UI discloses the fallback. A future catalog-enrichment migration can provide explicit tags without changing the engine or guide contract.

## Performance and privacy

The guide is dynamically imported only after the athlete taps it. Recommendation work is an in-memory pass over the already-authorized exercise DTO; it adds no database query, API route, analytics event, or persistence path. Consequently, it does not expand the existing personal-trainer RLS or consent surface and needs no database migration or endpoint load test.

## Evidence and product references

- [ACSM 2026 resistance-training guidance](https://acsm.org/resistance-training-guidelines-update-2026/) supports training major muscle groups at least twice weekly, heavier loading for strength, and roughly 10 weekly sets per muscle as a hypertrophy starting point while emphasizing adherence and individualization.
- [WHO physical-activity guidance](https://www.ncbi.nlm.nih.gov/books/NBK566046/) recommends aerobic activity plus muscle strengthening on at least two days and gradual progression from a manageable start.
- A [2024 systematic review and meta-analysis](https://pubmed.ncbi.nlm.nih.gov/38595233/) found full-body and split routines produce similar strength and hypertrophy outcomes when volume is equated; availability drives the default split here.
- A [network meta-analysis of resistance prescriptions](https://pmc.ncbi.nlm.nih.gov/articles/PMC10579494/) found many prescriptions effective, with heavier multiset work ranking highly for strength and multiset prescriptions for hypertrophy.
- [wger's routine model](https://wger.readthedocs.io/en/latest/api/routines.html) informed the separation of weekly routines, session slots, prescriptions, and actual logs.
- [Workout.cool](https://github.com/Snouzy/workout-cool) informed staged, progressively disclosed workout creation. No external code or exercise media is copied.

## Verification

- Pure engine contract: `.claude/test_workout-composition.mjs`
- Authenticated browser behavior: `tests/e2e/personal-trainer/workout-composer.spec.ts`
- Reproducible catalog fixtures: `scripts/setup-pt-local-qa.mjs`

The E2E contract covers add/recompute, reject, undo, skip, manual fallback, exact prescription handoff, normal save behavior, focus restoration, keyboard dismissal, Axe serious/critical checks, 80–200% zoom, mobile anatomy, classic editing, and desktop 3D regression boundaries.
