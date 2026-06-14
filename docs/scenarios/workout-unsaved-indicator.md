# Scenario: Unsaved changes indicator in active workout

## Intent
After adding a set during an active workout, the user has no clear signal that their progress exists only in the browser's memory and could be lost if they navigate away or the page reloads. The Save button is permanently visible but looks identical whether the user has unsaved work or not. The interface should communicate a dirty state — "you have changes not yet saved" — as soon as any set is added, and clear that signal after a successful save.

## Contract
- given: an in-progress workout with no unsaved changes (just started, or immediately after a successful save)
- when: the user adds a set via the Add button
- then: a visible unsaved indicator appears (for example: the Save button label changes to "Save •", or an "Unsaved" label appears near the header Save button)
- when: the user taps Save and the save completes (first-time warning confirmed if applicable)
- then: the unsaved indicator disappears
- invariant: the indicator reappears immediately when any further set is added after a save
- invariant: deleting a set also triggers the unsaved indicator (the local state has diverged from the DB)
- invariant: editing a set value (inline edit) and confirming also triggers the unsaved indicator
- invariant: the indicator is never shown on a completed workout or its read-only view
- invariant: loading the page with sets already in the DB (e.g., returning to an in-progress workout that was previously saved) does not show the unsaved indicator — the loaded state is in sync with the DB

## Steps
1. Start a blank in-progress workout — verify the Save button shows no unsaved indicator
2. Select an exercise, add one set — verify the unsaved indicator is now visible
3. Tap "Save" → confirm "Save anyway" (first-time warning) — verify the indicator disappears
4. Add another set — verify the indicator reappears immediately
5. Tap "Save" (no warning this time) — verify the indicator disappears again
6. Delete a set — verify the indicator reappears
7. Navigate away and return to the same in-progress workout (sets now loaded from DB) — verify no unsaved indicator is shown on load
8. Open a completed workout — verify no unsaved indicator appears at any point
