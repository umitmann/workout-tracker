// Tracks which mounted Modal instance is topmost so nested/stacked dialogs
// (e.g. an info modal opened from within the exercise picker sheet) route
// Escape/Tab to the one the user is actually looking at, not whichever
// mounted first. A module-level array is deliberate: every Modal in the tree
// must agree on a single ordering, and stacking depth is always small
// (2 deep in practice — a sheet plus one overlay on top of it).

let stack: symbol[] = []

/** Registers a newly-opened Modal as the topmost; returns its stack token. */
export function pushModal(): symbol {
  const token = Symbol('modal')
  stack = [...stack, token]
  return token
}

/** Unregisters a closed/unmounted Modal. Safe to call even if already popped. */
export function popModal(token: symbol): void {
  stack = stack.filter((t) => t !== token)
}

/** True when `token` belongs to the topmost (most recently opened) Modal. */
export function isTopmost(token: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === token
}
