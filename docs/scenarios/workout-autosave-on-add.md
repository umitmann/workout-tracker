# Scenario: Auto-save to DB after adding a set

## Intent
After adding a set during an active workout, the user's progress was only held in the browser's memory — a navigation or crash would erase it silently. Requiring a manual Save tap put the burden on the user to remember. Now, every time a set is confirmed via the "Add" button, the workout is saved to the database automatically, so the user never has to think about saving and never loses a set unexpectedly.

## Contract
- given: an in-progress workout is open
- when: the user taps "Add" to confirm a set (weight and/or reps entered)
- then: all current sets (including the new one) are persisted to the database before the next interaction
- then: the "Add" button remains available for the next set immediately (save is non-blocking)
- when: the user taps "Save" manually
- then: the same save-progress action runs; on the first manual save after a fresh page load the first-time warning is skipped (auto-save already satisfied it)
- invariant: "Done" still transitions the workout to completed status and redirects to /dashboard
- invariant: auto-save only runs when a set is added via the "Add" button — inline edits and deletions still require the manual Save button or "Done"
- invariant: auto-save never runs on a completed workout

## Steps
1. Start a blank in-progress workout
2. Select an exercise, enter weight and reps, tap "Add"
3. Set appears in the list — verify the workout sets are persisted (reload the page; the set should still be there)
4. Add a second set — verify the second set also persists on reload
5. Tap "Done" — workout completes; both sets appear in the completed summary
6. Open a completed workout — no "Add" button visible; auto-save does not run
