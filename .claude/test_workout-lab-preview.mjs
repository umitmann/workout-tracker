import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  WORKOUT_LAB_PREVIEW_PARAM,
  WORKOUT_LAB_PREVIEW_VALUE,
  isWorkoutLabPreviewEnabled,
  workoutLabPreviewHref,
} from '../src/lib/workoutLabPreview.ts'

test('workout lab is disabled unless the exact preview value is present once', () => {
  assert.equal(isWorkoutLabPreviewEnabled(undefined), false)
  assert.equal(isWorkoutLabPreviewEnabled(''), false)
  assert.equal(isWorkoutLabPreviewEnabled('true'), false)
  assert.equal(isWorkoutLabPreviewEnabled('workout-lab '), false)
  assert.equal(isWorkoutLabPreviewEnabled(['workout-lab']), false)
  assert.equal(isWorkoutLabPreviewEnabled('workout-lab'), true)
})

test('preview links preserve existing query parameters and fragments', () => {
  assert.equal(WORKOUT_LAB_PREVIEW_PARAM, 'preview')
  assert.equal(WORKOUT_LAB_PREVIEW_VALUE, 'workout-lab')
  assert.equal(workoutLabPreviewHref('/workouts/new'), '/workouts/new?preview=workout-lab')
  assert.equal(
    workoutLabPreviewHref('/workouts/template-id?date=2026-07-16#editor'),
    '/workouts/template-id?date=2026-07-16&preview=workout-lab#editor',
  )
})

test('desktop 3D is production-visible while unfinished mobile anatomy and guidance stay preview-only', async () => {
  const editor = await readFile(
    new URL('../src/app/workouts/[id]/TemplateEditor.tsx', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(
    editor,
    /workoutLabPreview && <button[\s\S]{0,800}Open 3D generator/,
  )
  assert.doesNotMatch(editor, /workoutLabPreview && generatorMode === 'desktop'/)
  assert.match(editor, /workoutLabPreview && showMobileMusclePlanner/)
  assert.match(editor, /workoutLabPreview && showCompositionGuide/)
})
