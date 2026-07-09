// Pure focus-trap/key-handling decisions for the shared Modal primitive
// (ADR-0008). No DOM: Modal.tsx measures its own focusable nodes and asks
// this module what to do with them. Kept separate from the component so the
// cycling/escape/backdrop rules are unit-testable without a browser.

/** True for the key that should dismiss any (non-destructive) open dialog. */
export function isEscapeKey(key: string): boolean {
  return key === 'Escape'
}

/**
 * ADR-0008: every dialog closes on backdrop click except a destructive
 * confirm, which requires an explicit button tap so a stray tap can never
 * discard user data.
 */
export function shouldCloseOnBackdropClick({ destructive }: { destructive: boolean }): boolean {
  return !destructive
}

/**
 * Where focus should land when the dialog opens. `initialIndex` lets a
 * caller request a specific focusable node (e.g. a search input) instead of
 * the default first-element behaviour; an out-of-range request is ignored.
 * Returns null when the dialog has nothing focusable inside it.
 */
export function resolveOpenFocusIndex({
  count,
  initialIndex,
}: {
  count: number
  initialIndex: number | null
}): number | null {
  if (count <= 0) return null
  if (initialIndex != null && initialIndex >= 0 && initialIndex < count) return initialIndex
  return 0
}

/**
 * Focus-trap cycling: given how many focusable elements sit inside the
 * dialog and which index currently has focus, where should Tab (or
 * Shift+Tab) send it next? Wraps at both ends so Tab can never escape the
 * dialog to the page behind it. `currentIndex` of -1 means focus is
 * currently outside the tracked set (treated as "before the first element").
 */
export function computeTabTarget({
  count,
  currentIndex,
  shiftKey,
}: {
  count: number
  currentIndex: number
  shiftKey: boolean
}): number | null {
  if (count <= 0) return null
  if (count === 1) return 0
  // currentIndex -1 means focus sits outside the tracked set (not yet
  // settled inside the trap): a forward Tab should still land on the first
  // element and a Shift+Tab on the last, i.e. exactly what wrapping would
  // give starting "one before" index 0.
  if (currentIndex < 0) return shiftKey ? count - 1 : 0
  const delta = shiftKey ? -1 : 1
  return (((currentIndex + delta) % count) + count) % count
}
