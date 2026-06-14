# Scenario: Scroll position restored in exercise picker after modal

## Intent
A user who opens a history or info modal for an exercise in the picker is snapped back to the top of the list when the modal closes. If they had scrolled to find an exercise near the bottom of a long list, opened its history, and dismissed the modal, they must scroll all the way back down to make a selection or check an adjacent exercise. The picker should remember where the user was and restore that position when a modal closes.

## Contract
- given: the exercise picker sheet is open and the user has scrolled past the first visible screen of results
- when: the user opens any modal from a row button (info, last session, best session, or best · 60 days)
- then: the modal appears over the picker
- when: the user dismisses the modal by any means (✕ button, outside tap, or back gesture)
- then: the picker scroll position is the same as it was before the modal opened; the row that triggered the modal is visible without any additional scrolling
- invariant: scroll position is restored regardless of which button was tapped or how the modal was dismissed
- invariant: if the user had not scrolled (still at the top), the picker remains at the top after modal dismissal — no jump occurs

## Steps
1. Start a workout, tap "Add exercise" — picker opens at the top
2. Scroll the picker list down until an exercise that was not visible at load is in view (e.g., 20+ rows from the top)
3. Note which exercise row is centred on screen
4. Tap the info (i) button on that row — info modal opens
5. Dismiss the modal
6. Verify: the picker scroll position matches step 3; the same exercise row from step 3 is visible without scrolling
7. Tap the clock button on the same row — Last session modal opens
8. Dismiss — verify scroll position is again where it was in step 3
