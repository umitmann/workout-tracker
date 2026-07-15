export const WORKOUT_LAB_PREVIEW_PARAM = 'preview'
export const WORKOUT_LAB_PREVIEW_VALUE = 'workout-lab'

/**
 * This is a product-visibility gate, not an authorization control. Requiring
 * one exact string keeps accidental or repeated query values fail-closed.
 */
export function isWorkoutLabPreviewEnabled(value: unknown): boolean {
  return typeof value === 'string' && value === WORKOUT_LAB_PREVIEW_VALUE
}

export function workoutLabPreviewHref(href: string): string {
  const url = new URL(href, 'https://workout-tracker.local')
  url.searchParams.set(WORKOUT_LAB_PREVIEW_PARAM, WORKOUT_LAB_PREVIEW_VALUE)
  return `${url.pathname}${url.search}${url.hash}`
}
