# D2 — Weight/reps input: custom numpad + ±1 arrows

**Source:** Tile 10b (+ Tile 10 "manual overwrites arrows" invariant) · **Wave:** 1
(parallel with D1) · **Migration:** none

## Decisions (from the inventory)
1. **Tapping the value opens a custom numpad** — digits 0-9, a **delete** key, and
   dedicated **.25 / .5 / .75** fraction keys. Fraction keys appear **only in
   `decimal` mode** (weight), not for reps/tempo. Include a done/close affordance and
   a way to enter whole numbers cleanly.
2. **Arrows always step by 1.** Weight's `step={2.5}` becomes effectively 1 for the
   ▲/▼ buttons; all sub-integer precision comes from the numpad fraction keys.
3. **Touch → custom numpad, suppress the OS keyboard** (readonly input + custom pad);
   **desktop/PC → native keyboard entry into the field still works.** Detect via
   pointer/touch capability, not user-agent sniffing where avoidable.
4. **Manual entry is authoritative over the arrows:** a numpad/keyboard value
   overwrites the current value, and a later ▲/▼ bump operates on the typed value —
   never the reverse. (This is the resolved "manual enter should overwrite the upper
   lower thing" note.)
5. **Same input everywhere.** Because the change lives in `Stepper.tsx`, every
   weight-entry site inherits it: add form, inline set editor, single-set guided
   setup, whole-exercise guide setup, and the routines `TemplateEditor`.

## Files
- `src/app/workout/[id]/Stepper.tsx` — core change; keep the `commitNumericDraft`
  draft-string model (finding L3 — never coerce mid-typing).
- **new** `src/app/workout/[id]/Numpad.tsx` — the custom pad (self-contained, a11y:
  44px targets per ADR-0008, focus-trapped, dismissible).
- `src/lib/numericInput.ts` — extend if needed for fraction-append semantics; keep
  pure + unit-tested.
- Call sites only if a prop must change (e.g. dropping/altering `step` for weight):
  `WorkoutLogger.tsx`, `TemplateEditor.tsx`, and any other `Stepper` users. Keep these
  edits minimal (prop-level) to avoid colliding with later WorkoutLogger dockets.

## Acceptance
- Tap weight on a touch device → numpad opens, OS keyboard does not; enter 60, tap
  `.5` → 60.5; delete works; ▲ → 61.5, ▼ → 60.5 (±1).
- Reps numpad shows no fraction keys.
- Desktop: focus the field, type 62.5 on the hardware keyboard → accepted.
- Arrow then manual type → typed value wins; then ▲ adjusts from the typed value.
- Inline editor + both guide setups + TemplateEditor all show identical behaviour.
- `npx tsc --noEmit` clean; `numericInput`/Stepper tests pass; add tests for
  fraction-append + manual-overwrites-arrows.

## Conflicts
Touches `WorkoutLogger.tsx` only at Stepper call sites (shallow prop edits). Merge D2
**before** the WorkoutLogger-heavy dockets so they rebase on the new Stepper API.
