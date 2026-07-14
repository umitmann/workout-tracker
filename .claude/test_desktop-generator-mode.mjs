import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DESKTOP_GENERATOR_MIN_WIDTH,
  isDesktopGeneratorEligible,
  resolveWorkoutGeneratorMode,
} from '../src/lib/desktopGeneratorMode.ts'

test('the 3D generator is a desktop-only opt-in', () => {
  assert.equal(DESKTOP_GENERATOR_MIN_WIDTH, 1024)
  assert.equal(isDesktopGeneratorEligible(1023), false)
  assert.equal(isDesktopGeneratorEligible(1024), true)
  assert.equal(resolveWorkoutGeneratorMode('classic', 1440), 'classic')
  assert.equal(resolveWorkoutGeneratorMode('desktop', 1440), 'desktop')
})

test('mobile and invalid viewport widths always fall back to the established editor', () => {
  for (const width of [0, -1, Number.NaN, 320, 390, 768, 1023]) {
    assert.equal(resolveWorkoutGeneratorMode('desktop', width), 'classic')
  }
})
