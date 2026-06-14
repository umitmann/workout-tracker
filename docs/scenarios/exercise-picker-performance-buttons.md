# Scenario: Performance buttons in exercise picker

## Intent
A user browsing the exercise picker to decide which exercise to do next needs to compare performance history across multiple exercises without committing to any of them. Today the picker shows an info button per row but no performance history buttons (last session, best session, best · 60 days). A user who wants to compare two exercises — "was my bench press better than my incline press last Monday?" — must exit the picker, look them up separately, and return, breaking the selection flow entirely.

## Contract
- given: the exercise picker sheet is open (from "Add exercise" in the logger or the template editor)
- when: the user views any exercise row in the picker
- then: the info (i), last session (clock), best session (trophy), and best · 60 days (bolt) buttons are visible on that row
- when: the user taps any of the four buttons on a row
- then: the corresponding modal opens while the picker remains open beneath it
- when: the user dismisses the modal
- then: the picker is still open and the exercise was not selected
- invariant: tapping a history or info button never selects the exercise or closes the picker
- invariant: tapping on the exercise name or the row body (outside the four buttons) selects the exercise and closes the picker (existing behaviour preserved)

## Steps
1. Start a workout, tap "Add exercise" — picker opens
2. Verify that each visible exercise row shows i, clock, trophy, and bolt buttons alongside the name
3. Scroll down — verify buttons remain present on all rows at all scroll positions
4. Tap the clock button on any exercise row — Last session modal opens; picker is still behind it
5. Dismiss the modal — picker is open, no exercise was selected
6. Tap the trophy button on a different exercise — Best session modal opens
7. Dismiss — picker still open, still no selection
8. Tap the exercise name on any row — exercise is selected, add-set form opens, picker closes (existing behaviour)
