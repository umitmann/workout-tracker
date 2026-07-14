export const DESKTOP_GENERATOR_MIN_WIDTH = 1024

export type WorkoutGeneratorMode = 'classic' | 'desktop'

export function isDesktopGeneratorEligible(viewportWidth: number): boolean {
  return Number.isFinite(viewportWidth) && viewportWidth >= DESKTOP_GENERATOR_MIN_WIDTH
}

export function resolveWorkoutGeneratorMode(
  requestedMode: WorkoutGeneratorMode,
  viewportWidth: number,
): WorkoutGeneratorMode {
  return requestedMode === 'desktop' && isDesktopGeneratorEligible(viewportWidth)
    ? 'desktop'
    : 'classic'
}
