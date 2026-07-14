# Desktop 3D workout generator

## User outcome

On a desktop viewport, a user can explicitly open a three-panel generator:

1. search or filter the exercise library;
2. preview and add exercises while a rotatable human body updates; and
3. set the workout order, sets, reps, weight, duration, and distance before
   saving or starting through the existing template actions.

The existing editor is the default at every viewport. The 3D switch is hidden
below 1024 CSS pixels, and an open generator returns to the classic editor if
the viewport becomes smaller. Switching views preserves the shared, unsaved
editor state. Mobile behavior and persistence are not forked.

## Explainable load model

The visualization is labelled **programmed muscle exposure**. It is a relative
planning aid, not a medical measurement or a prediction of hypertrophy,
fatigue, force, or injury risk.

- Each effective set contributes `1.0` to every primary muscle.
- Each effective set contributes `0.5` to every secondary muscle.
- A per-set/dropset prescription uses its actual row count; a uniform
  prescription uses its set count.
- If one exercise lists a muscle as both primary and secondary, primary wins
  and the set is counted once.
- The highest score in the current workout is normalized to `100%`; all other
  displayed percentages are relative to it.
- The keyboard map shows the absolute score as set-equivalents (`eq`) beside
  that percentage, so adding sets remains visible even when only one muscle is
  loaded.
- Missing exercise metadata is reported by the model and never guessed.

The database catalog remains the source of truth for primary and secondary
muscles. The 17 standard catalog muscles have explicit front, back, or side 3D
regions. Unknown future muscle labels remain visible in the keyboard map even
when no 3D region exists yet.

## Interaction and accessibility

- Drag rotates, the wheel zooms, and the front/back/reset controls position the
  camera.
- Hovering or focusing an exercise previews its muscles before selection.
- Clicking a 3D muscle filters the library; every 3D action also has a normal
  labelled button so keyboard and non-WebGL users retain the workflow.
- The color scale always has percentages and text labels; color is not the
  only carrier of meaning.
- Advanced dropsets, tempo, and rest targets remain in the established editor.
  “Fine-tune advanced targets” switches there without losing state.

## Release contract

`npm run test:desktop:unit` covers the formula, anatomy completeness, desktop
eligibility, rolling RPC fallback, UI lazy-loading, WebGL cleanup, and additive
migration contract. `npm run test:desktop:e2e` covers live selection, load
updates, target editing, state preservation, camera controls, axe serious and
critical findings, resize fallback, horizontal overflow, and the unchanged
mobile exercise picker.
