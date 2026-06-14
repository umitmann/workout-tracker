# Scenario: exercise picker muscle & category filter

## Intent
When adding exercises — whether logging a workout or editing a template — users can only find exercises by typing a name they already know. Someone who wants "a strength exercise for chest" has no shortcut. This feature adds tappable muscle-group and category chips to the exercise picker (the single shared component used in every entry point) so users can narrow by body part, training style, or any combination of both — always in conjunction with the existing text search — without needing to know an exercise name upfront. The muscle chips already displayed in the exercise info modal become tappable too: tapping one when the modal is open inside the picker closes the modal and activates that muscle filter, giving users a fast "show me more like this" path.

## Contract
- given: The exercise picker is open; exercises carry `muscles` (string array, nullable) and `category` (string, nullable) fields
- given: No filters are active on open — the full exercise list is shown
- when: User activates any combination of muscle chips, category chips, and/or types in the search box
- then: The visible list contains only exercises that satisfy ALL active constraints simultaneously
- then: Selected muscle chips narrow using OR — exercise must target at least one of the selected muscles
- then: Selected category chips narrow using OR — exercise's category must be one of the selected categories
- then: Text search, muscle filter, and category filter combine with AND — every active dimension must match
- then: Zero matches shows a "No exercises match your filters." message and a "Clear filters" action that resets all chips and text
- when: User taps a primary muscle chip inside the exercise info modal (opened from within the picker)
- then: The info modal closes, and that muscle is activated as a filter chip in the picker
- invariant: Filters never silently relax — a zero-result combination never auto-expands the result set
- invariant: Filter state (chips + text) resets when the picker is closed and reopened
- invariant: The same filter behaviour applies in every context the picker appears (workout logger, template editor)
- invariant: An exercise with `muscles = null` never appears when any muscle chip is active
- invariant: Tapping a muscle chip in the info modal when the modal was NOT opened from the picker has no filter side-effect (display-only as before)
- invariant: Scroll position in the picker is restored after dismissing the info modal, consistent with section 13 of the behaviour checklist

## Steps
1. Add `muscles: string[] | null` to `SlimExercise` in `ExercisePickerSheet.tsx`
2. Update the DAL query that fetches exercises for the picker to include `muscles`
3. In `ExercisePickerSheet`: derive unique sorted muscle labels and category labels from the loaded exercise list
4. Render a horizontally scrollable chip row for muscles and a chip row for categories in the picker header, below the text input; active chip is orange/filled, inactive is zinc/outlined; tapping toggles membership in the active set
5. Compute `filtered`: start with all exercises, apply text filter (name includes search string, case-insensitive), apply muscle filter (if any chips active: `exercise.muscles` overlaps active muscle set), apply category filter (if any chips active: `exercise.category` is in active category set)
6. When `filtered` is empty: show "No exercises match your filters." and a "Clear filters" button that resets chips and text
7. Add an `onMuscleClick?: (muscle: string) => void` callback to `ExerciseInfoModal`; render primary muscle chips as `<button>` elements when this prop is provided, `<span>` otherwise
8. In `ExercisePickerSheet`, pass `onMuscleClick` to the info modal that activates the chosen muscle chip and closes the modal; scroll position must be preserved as per existing scroll-restore logic
9. On picker unmount or `onClose`: chip selections do not persist — next open starts clean
