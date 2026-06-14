# Scenario: Exercise import pipeline

## Intent
The app's exercise library sometimes lacks exercises users want to log. An operator runs a three-step pipeline — fetch from wger.de, merge into the local catalogue, seed into the database — to expand the library without manual data entry and without introducing duplicate or corrupt rows.

## Contract
- given: `scripts/exercises.json` exists with at least one exercise; the wger.de API is reachable; Supabase credentials are available in `.env.local`
- when:  the operator runs `npm run exercises:import` (fetch-wger → merge → seed) or each step individually
- then:  the Supabase `exercises` table gains all exercises present in the merged JSON that were not already in the DB; exercise count in the DB is strictly greater than or equal to the count before the run
- invariant: no exercise name appears more than once in the final `exercises.json` (case-insensitive)
- invariant: no exercise name appears more than once in the `exercises` table after seeding (case-insensitive)
- invariant: images sourced from wger are stored as absolute URLs; images sourced from yuhonas are stored with the GitHub raw-content prefix
- invariant: every inserted exercise row has a non-empty `name` and a non-null `category`
- invariant: re-running the full pipeline a second time inserts zero additional rows and exits without error

## Steps
1. Operator runs `npm run exercises:fetch-wger` — script paginates wger.de `/api/v2/exerciseinfo/` and writes `scripts/exercises-wger.json` with normalised fields (`name`, `category`, `equipment`, `primaryMuscles`, `secondaryMuscles`, `images`, `instructions`).
2. Operator runs `npm run exercises:merge` — script reads both JSON files, deduplicates by name (case-insensitive), appends net-new entries to `scripts/exercises.json`, and logs counts.
3. Operator runs `npm run seed:exercises` — script fetches all existing names from the DB, filters the JSON to only net-new entries, batch-inserts in groups of 100, and logs progress.
4. On any step failure the script exits non-zero with a clear error message; no partial state is silently swallowed.
