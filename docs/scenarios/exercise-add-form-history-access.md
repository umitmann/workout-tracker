# Scenario: History access in add-set form

## Intent
A user who selects an exercise to add to their active workout needs to check their own performance history — what weight they used last time, their best session — before committing to a weight. Today, history buttons only appear on an exercise card after the user has already added at least one set, so the user must enter a weight blind, add the set, then look up history and decide whether to delete and re-add with corrected values. The exercise should expose its full history while the user is still filling in the first set, not after.

## Contract
- given: a workout is in progress and the user has selected an exercise via the picker (the add-set form panel is visible)
- given: the selected exercise has zero sets in the current workout session
- when: the add-set form panel is visible
- then: the info button (i), last session (clock), best session (trophy), and best · 60 days (bolt) buttons are visible in the form header alongside the exercise name
- when: the user taps any of the four buttons
- then: the corresponding modal opens without dismissing the add-set form
- when: the user dismisses the modal
- then: the add-set form is still visible with weight and reps inputs intact
- invariant: the four buttons are present in the form header regardless of whether history data exists for the exercise (buttons appear even if "no sessions yet")
- invariant: the weight and reps inputs remain focusable while no modal is open
- invariant: this behaviour is identical when the exercise already has sets in the current workout (the "+" quick-add path)

## Steps
1. Start a blank in-progress workout
2. Tap "Add exercise", select any exercise
3. The add-set form panel appears — verify that the i, clock, trophy, and bolt buttons are visible in the panel header next to the exercise name, above the weight/reps inputs
4. Tap the clock (last session) button — the Last session modal opens
5. Dismiss the modal (✕ or outside tap) — the add-set form is still visible; inputs are unchanged
6. Tap the i button — exercise info modal opens
7. Dismiss — form still visible, no input values lost
8. Fill in weight and reps, tap "Add"
9. Set appears in the grouped exercise list above; the exercise header in that list also shows the four buttons (existing behaviour unchanged)
