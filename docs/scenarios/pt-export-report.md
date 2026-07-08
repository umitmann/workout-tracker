# Scenario: PT export report + bodyweight log

## Intent
A user wants to hand their personal trainer a summary of recent training. They
export the last 7 or 30 days as a plain-text report from the dashboard. They also
log their bodyweight once a day and see the trend, which flows into the report.

## Contract — export
- given: the user is on the dashboard
- when: they tap "Last week" or "Last month" under Export for PT
- then: a `.txt` file downloads containing, in chronological order, each
  completed workout grouped by exercise, each set rendered as `weight kg × reps`
  (strength) or `min · km` (cardio), with recorded rest shown as `(rest Ns)`
- then: a summary reports workout count, total set count, total volume (kg), and
  the bodyweight change over the period
- invariant: only `completed` workouts in range are included
- invariant: an empty range produces a clear "No workouts logged" message
- invariant: no `null` literals leak into the text

## Contract — bodyweight
- given: the dashboard bodyweight card
- when: the user enters today's weight and taps Log
- then: it is upserted (one row per user per day) and the latest value + delta
  vs the previous entry are shown
- invariant: reads tolerate the `body_weights` table not existing yet (empty)

## Pure logic (unit-tested — `.claude/test_pt-report.mjs`)
`src/lib/buildReport.ts`: `buildReport(input)` — deterministic text builder,
sorts workouts/bodyweights, formats sets, computes volume + bodyweight delta.
