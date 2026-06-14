# ADR-0002: Exercise seed deduplication via pre-fetch rather than DB upsert

**Status:** Draft
**Date:** 2026-06-14
**Scenario:** [exercise-import-pipeline](../scenarios/exercise-import-pipeline.md)

## Context
The exercise seed script inserts rows from a local JSON file into a Supabase `exercises` table. When a second data source (wger.de) was added, we needed a strategy to avoid inserting duplicate exercise names on repeated runs or when sources overlap.

The obvious approach is a Supabase `upsert` with `onConflict: 'name'`, which lets the DB enforce uniqueness atomically. This requires a `UNIQUE` constraint on `exercises.name`. We do not currently have that constraint, and adding it retroactively risks a migration failure if the existing data already contains case-variant duplicates.

## Decision
We will deduplicate in two layers in application code rather than in the DB:

1. **Merge layer** (`merge-exercises.ts`): deduplicates by name (case-insensitive) before writing the merged JSON, so `exercises.json` is always clean.
2. **Seed layer** (`seed-exercises.ts`): fetches all existing names from the DB before inserting, filters the JSON to net-new entries only, then uses a plain `insert`.

This means re-running the pipeline is safe without any schema change.

## Consequences
- **Positive:** No migration required; works with the existing schema; idempotent by design; easy to reason about.
- **Negative:** Seed script does a full name-fetch on every run (O(n) read before insert). Acceptable at current scale (<5 000 exercises); revisit if the table grows by an order of magnitude.
- **Deferred:** If we ever want true atomic upsert guarantees (e.g. concurrent seed runs), we should add `UNIQUE (lower(name))` to the `exercises` table and switch to `upsert`. That migration should include a dedup pass on existing data first.

## Alternatives considered
- **Supabase upsert with `onConflict: 'name'`** — rejected because there is no unique constraint on `name` and adding one requires a safe migration with a prior dedup pass.
- **Client-side set intersection only at merge time** — rejected because the DB may have been partially seeded from a previous JSON state; the seed layer needs its own check against live DB state.
