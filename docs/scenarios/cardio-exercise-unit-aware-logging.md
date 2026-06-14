# Scenario: Cardio exercise unit-aware logging

## Intent
A user who logs cardio exercises — running, cycling, jump rope, rowing — cannot meaningfully record their session today. The add-set form only accepts weight (kg) and rep count; there is nowhere to enter duration or distance. Cardio exercises exist in the exercise picker and can be selected, but the resulting log is either empty or semantically wrong (a "rep" of running makes no sense). The logger should detect the exercise category and present appropriate input fields — duration and optionally distance for cardio; weight and reps for strength — so every exercise type produces a meaningful record.

## Contract
- given: the user has selected an exercise whose category is "cardio" (e.g. Running, Cycling, Jump Rope)
- when: the add-set form opens for that exercise
- then: the form shows a duration field (minutes) and an optional distance field; weight and reps inputs are not shown
- given: the user has selected a strength/non-cardio exercise (e.g. Bench Press, Squat)
- when: the add-set form opens for that exercise
- then: the form shows weight (kg) and reps inputs as today — no regression
- when: the user logs a cardio set with duration only
- then: the set is saved with duration_minutes populated and weight/reps null
- when: the user logs a cardio set with duration and distance
- then: both duration_minutes and distance are saved; the distance unit (km or m) is displayed alongside the value according to the user's configured preference
- when: the user completes a workout containing cardio sets
- then: the completed-workout summary shows duration and distance (where present) per cardio set row; weight and reps columns are omitted for those rows
- invariant: selecting an exercise in the picker does not depend on exercise category — cardio and strength exercises are selectable under identical conditions
- invariant: set rows for strength exercises continue to display weight and reps; cardio set rows display duration and distance — the two layouts coexist in a single workout without conflict
- invariant: the distance unit displayed (km vs m) is consistent within a session and matches the user's configured preference
- invariant: saving or completing a workout with cardio sets preserves duration_minutes and distance through a full save → reload cycle — neither field is overwritten with null by the strength-exercise save path

## Steps
1. Open the exercise picker, search "Running" — confirm it appears in results and is tappable (no category-based exclusion)
2. Tap "Running" — add-set form opens; confirm the form shows a duration (minutes) field and a distance field; confirm weight and reps inputs are absent
3. Enter 30 minutes and 5 km; tap "Add" — the set appears in the Running group displaying "30 min · 5 km"
4. In the same workout, add "Bench Press" via the picker — add-set form shows kg and reps inputs only; no duration or distance fields
5. Enter 80 kg, 8 reps; tap "Add" — set row shows "80 kg × 8" (existing behaviour, no regression)
6. Tap "Done" — workout completes and redirects to /dashboard; open the completed workout; confirm Running shows "30 min · 5 km" and Bench Press shows "80 kg × 8"
7. Reload the completed workout URL — both sets still display correct values (round-trip persistence check)
