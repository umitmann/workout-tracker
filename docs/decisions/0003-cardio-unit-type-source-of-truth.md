# ADR-0003: Exercise logging mode — category-seeded default with per-exercise user toggle (target design)

**Status:** Draft
**Date:** 2026-06-14
**Scenario:** [cardio-exercise-unit-aware-logging](../scenarios/cardio-exercise-unit-aware-logging.md)

## Context
The add-set form needs to render either weight+reps or duration+distance inputs. The question is who decides: the exercise's category, a global user preference, or the user at logging time.

The `sets` table already has `duration_minutes` and `distance` columns alongside `weight` and `reps`, so both modes are storable without schema changes.

**Clarification from design review (2026-06-14):** "configurable" means the user explicitly picks the mode per exercise during a session — they are not locked into a mode because the exercise is labelled cardio. A plank (strength category) might be logged by time; a weighted sled push (strength) might use weight+reps. The category is a hint, not a rule.

## Decision (target)
The add-set form will show a **mode toggle** per exercise (e.g. "Reps" ↔ "Time") that the user can flip at any point. The exercise `category` seeds the default — `"cardio"` defaults to duration+distance, everything else defaults to weight+reps — but the user can override it freely without changing the exercise's category.

The mode selection is **session-local** (not persisted to the DB per exercise). The DB stores whichever fields are populated for a given set; a set with `duration_minutes` set and `weight` null is implicitly a "time" set regardless of category.

## Current implementation (stepping stone)
The shipped v1 hard-infers mode from category with no override: `category === "cardio"` → duration+distance form, everything else → weight+reps. This satisfies the core bug (cardio exercises are now loggable) but does not yet expose the toggle. The toggle is the next iteration.

## Consequences
- **Positive:** Mode is user-controlled — a strength exercise can be logged by time without re-categorising it; a cardio exercise can be given weight (e.g. weighted vest run).
- **Negative:** The toggle adds a UI element to every add-set form; the default must be correct most of the time to avoid friction.
- **Deferred:** Persisting a per-exercise mode preference across sessions (e.g. "always default Running to time mode") — out of scope until user feedback shows it is needed.

## Alternatives considered
- **Hard-infer from category, no override** — implemented as v1 stepping stone; insufficient as the end state because it blocks valid cross-category logging (plank by time, sled by weight).
- **Global user preference (km vs m, reps vs time)** — rejected; too coarse. A user may log some exercises by reps and others by time in the same workout.
- **Add `unit_type` column to `exercises`** — rejected; pushes a per-session UI choice into a shared, rarely-changing data catalogue. 1 600+ rows would need backfill and the column would still need a session-level override anyway.
