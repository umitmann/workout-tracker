import { useRef, useCallback } from 'react'

interface UseSwipeOptions {
  /** Minimum horizontal distance (px) to register as a swipe. Default: 50 */
  threshold?: number
  /** Maximum vertical drift (px) before the gesture is cancelled. Default: 80 */
  maxVerticalDrift?: number
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
}

export function useSwipe({
  threshold = 50,
  maxVerticalDrift = 80,
  onSwipeLeft,
  onSwipeRight,
}: UseSwipeOptions) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    startX.current = t.clientX
    startY.current = t.clientY
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (startX.current === null || startY.current === null) return
    const t = e.changedTouches[0]
    const dx = t.clientX - startX.current
    const dy = t.clientY - startY.current
    startX.current = null
    startY.current = null
    if (Math.abs(dy) > maxVerticalDrift) return
    if (dx < -threshold) onSwipeLeft?.()
    else if (dx > threshold) onSwipeRight?.()
  }, [threshold, maxVerticalDrift, onSwipeLeft, onSwipeRight])

  return { onTouchStart, onTouchEnd }
}
