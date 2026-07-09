# ADR-0008: Interaction baseline — shared Modal primitive, 44 px touch targets, confirm-or-undo on destructive taps

**Status:** Accepted — implemented 2026-07-09 (see docs/quality-survey-2026-07-09.md § Resolution)
**Date:** 2026-07-09
**Source:** [Quality survey 2026-07-09](../quality-survey-2026-07-09.md) findings H6, M1, M2

## Context
Three systemic interaction problems, each currently re-decided ad hoc per feature:

1. **Modals:** every overlay (LastPerfModal, ExerciseInfoModal, ExercisePickerSheet,
   and seven inline confirm dialogs in WorkoutLogger) is a bare `fixed inset-0` div
   with a backdrop onClick. A repo-wide grep finds no `role="dialog"`, no `aria-modal`,
   no Escape/keydown handler, no focus trap or restoration. Screen-reader users are
   never told a dialog opened; keyboard users can Tab behind it and cannot dismiss it.
2. **Touch targets:** the i/clock/trophy/bolt buttons are `w-5 h-5` (20 px) packed
   four-abreast in every exercise header; reorder arrows are 28 px; the set-delete ✕
   has no sized hit area at all and sits flush against the guided ▶. All below the
   44 px iOS HIG / 24 px WCAG 2.2 AA minimum — mis-tap-prone with sweaty hands.
3. **Destructive taps:** abandon, discard, paste-overwrite, and calendar delete all
   confirm; deleting a logged set does not — one mis-tap, and after the next
   autosave/Done the set is permanently gone.

## Decision
1. **One Modal primitive** (`src/components/Modal.tsx`) wraps every overlay:
   `role="dialog"`, `aria-modal="true"`, labelled by its title, focus moved in on
   open, trapped while open, restored to the trigger on close, Escape closes,
   backdrop click closes (unless the dialog is destructive-confirm, which requires an
   explicit button). All existing overlays migrate to it; new overlays must use it.
2. **44 px minimum hit area** for every interactive control (`min-w-11 min-h-11` or
   padded wrapper — the visual icon may stay small). Destructive controls get spatial
   separation from adjacent targets. Enforced by a Playwright assertion that measures
   `boundingBox()` of the logger's controls.
3. **Destructive actions confirm or offer undo.** Set deletion adopts the calendar's
   existing two-tap confirm pattern (✕ → Confirm/Cancel in place). Rule of thumb: any
   tap that discards user-entered data is either confirmable or undoable.

## Consequences
- **Positive:** dialogs become usable by screen-reader/keyboard users; one place to
  get focus management right; mis-tap data loss closed; consistent with the app's own
  existing confirm patterns.
- **Negative:** the Modal migration touches ten call sites; larger hit areas cost
  horizontal space in the exercise header (may need to drop to a 2×2 grid or overflow
  menu on narrow screens — layout call made during implementation).
- **Testing:** the Modal contract (role, Escape, trap, restore) is unit-testable;
  target sizes are a Playwright measurement test.

## Alternatives considered
- **Native `<dialog>` element** — attractive (free focus trap + Escape), but iOS
  Safari support for `showModal` focus behaviour is inconsistent with sheets/animations
  already in use; a controlled div with explicit trap keeps parity with current
  styling. Revisit when the sheet animations are rebuilt.
- **Headless UI dependency (Radix, Headless UI)** — rejected: single-purpose need, and
  the project has deliberately few dependencies.
- **Swipe-to-delete with undo snackbar for sets** — deferred: better ergonomics but
  new gesture plumbing; two-tap confirm ships the safety now without blocking a later
  upgrade.
