# Scenario: Muscle-group exercise picker

## Intent
The raw exercise library tags each exercise with fine-grained muscles (`lats`,
`quadriceps`, …). A user browsing for the next exercise thinks in muscle *groups*
(Back, Legs, …) and wants to see, at a glance, how many exercises remain in each
group given their current search/category filters — then narrow to one group in
a single tap (or hover, on desktop).

## Contract
- given: the exercise picker is open
- then: a row of muscle-group chips (Chest, Back, Shoulders, Arms, Core, Legs)
  is shown, each with a count of matching exercises under the current text +
  category filters ("what's left there")
- when: the user hovers a chip (desktop)
- then: the list below previews that group's exercises without committing
- when: the user taps a chip
- then: the muscle filter is set to that group's muscles; tapping the active
  chip again clears it
- invariant: a chip with a zero count (and not active) is disabled
- invariant: every raw muscle in the seed maps to exactly one group

## Pure logic (unit-tested — `.claude/test_muscle-groups.mjs`)
`src/lib/muscleGroups.ts`: `MUSCLE_GROUPS`, `muscleGroupOf`, `musclesForGroup`,
`countByGroup`. The chip → filter mapping reuses the existing OR-match
`filterExercises` logic (see `exercise-picker-muscle-filter.md`).
