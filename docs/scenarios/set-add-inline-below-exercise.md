# Scenario: Add-set form appears inline below the target exercise

## Intent
When a user taps the "+" quick-add button on an exercise card, the add-set form currently appears at the very bottom of the page — far below the exercise they are adding to, especially in workouts with many exercises. The user must scroll down to reach the form, fill it in, then scroll back up to see the set land under its exercise. The form should appear immediately below the exercise whose "+" was tapped so the interaction stays in context and the user never loses sight of the exercise they are working on.

## Contract
- given: an in-progress workout with two or more exercise groups logged
- when: the user taps the "+" quick-add button on exercise X (X is not the last exercise on the page)
- then: the add-set input form appears directly below exercise X's existing set rows, not below all other exercises
- when: the user fills in the form and taps "Add"
- then: the new set row appears as the last row in exercise X's group; the form remains in position below exercise X for the next set
- invariant: the form position tracks whichever exercise the user last tapped "+" on — it moves to that exercise's group, not back to the bottom
- invariant: tapping "+" on exercise Y (a different exercise) relocates the form to below exercise Y's sets, leaving exercise X's sets unchanged
- invariant: the full-page "Add exercise" button (which opens the picker to add a new, unseen exercise) remains separate and is not affected by this change

## Steps
1. Start a workout and add bench press with two sets
2. Add squat with two sets (squat now appears below bench press on screen)
3. Tap "+" on bench press (the first exercise)
4. Verify: the weight/reps input form appears below bench press's two set rows, above the squat group — not at the bottom of the page
5. Fill in weight and reps, tap "Add"
6. A third set appears under bench press; the form remains below bench press
7. Tap "+" on squat — the form moves to below squat's sets
8. Fill in and tap "Add" — new set appears under squat; form stays with squat
