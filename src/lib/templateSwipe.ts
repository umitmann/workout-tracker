export type TemplateSwipeAction = 'delete' | 'start' | null

export type TemplateSwipeGesture = {
  deltaX: number
  deltaY: number
  threshold?: number
  maxVerticalDrift?: number
}

/**
 * Resolve a completed template-card gesture without coupling the safety rule
 * to React. Vertical or ambiguous movement is treated as page scrolling and
 * can never start or delete anything.
 */
export function resolveTemplateSwipe({
  deltaX,
  deltaY,
  threshold = 72,
  maxVerticalDrift = 64,
}: TemplateSwipeGesture): TemplateSwipeAction {
  const horizontalDistance = Math.abs(deltaX)
  const verticalDistance = Math.abs(deltaY)

  if (
    horizontalDistance < threshold
    || verticalDistance > maxVerticalDrift
    || horizontalDistance <= verticalDistance
  ) {
    return null
  }

  return deltaX > 0 ? 'delete' : 'start'
}
