# ADR-0001: Exercise picker filter uses OR within each dimension

**Status:** Draft
**Date:** 2026-06-14
**Scenario:** [exercise-picker-muscle-filter](../scenarios/exercise-picker-muscle-filter.md)

## Context
The exercise picker filter lets users activate multiple muscle chips and multiple category chips simultaneously. When more than one chip in the same dimension is active (e.g. "chest" + "triceps"), there are two defensible interpretations: OR (show exercises that target at least one selected muscle) and AND (show only exercises that target all selected muscles). The choice is invisible to a future developer reading the code; the behaviour looks identical when a single chip is active.

## Decision
We use OR within each filter dimension (muscles, categories) and AND across dimensions. Selecting "chest" + "triceps" shows every exercise that hits chest *or* triceps. Combining that with category "strength" further narrows to strength exercises only.

## Consequences
- **Positive:** Broader results per selection — better for browsing ("what can I do for my push day?"). Avoids empty results from overly strict intersections.
- **Negative:** Cannot express "show me only true compound exercises that hit both chest and triceps" — that requires AND-within-muscles logic.
- **Deferred:** AND-within-muscles mode could be a long-press or an "strict mode" toggle; not in scope for this iteration.

## Alternatives considered
- **AND within muscles** — rejected because typical use is "I want something for chest OR shoulders", not "I want an exercise that hits chest AND shoulders and nothing else". AND logic would produce empty results too often for a browsing-first interaction.
- **Equipment filter** — deferred, not rejected. The `equipment` column exists in the DB and the same chip pattern applies. Excluded from this iteration to keep scope small.
