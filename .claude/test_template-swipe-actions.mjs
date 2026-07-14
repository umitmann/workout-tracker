import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { resolveTemplateSwipe } from '../src/lib/templateSwipe.ts'

test('a deliberate right swipe requests deletion', () => {
  assert.equal(resolveTemplateSwipe({ deltaX: 96, deltaY: 8 }), 'delete')
})

test('a deliberate left swipe starts the template immediately', () => {
  assert.equal(resolveTemplateSwipe({ deltaX: -96, deltaY: 8 }), 'start')
})

test('short gestures and vertical scrolling never trigger template actions', () => {
  assert.equal(resolveTemplateSwipe({ deltaX: 47, deltaY: 2 }), null)
  assert.equal(resolveTemplateSwipe({ deltaX: -47, deltaY: 2 }), null)
  assert.equal(resolveTemplateSwipe({ deltaX: 110, deltaY: 90 }), null)
  assert.equal(resolveTemplateSwipe({ deltaX: -110, deltaY: -90 }), null)
  assert.equal(resolveTemplateSwipe({ deltaX: 80, deltaY: 81 }), null)
})

test('the workout-template list uses swipe actions and has no one-tap delete form', async () => {
  const [page, list, actions] = await Promise.all([
    readFile(new URL('../src/app/workouts/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/workouts/TemplateSwipeList.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/actions/templates.ts', import.meta.url), 'utf8'),
  ])

  assert.match(page, /<TemplateSwipeList templates=\{templates\}/)
  assert.doesNotMatch(page, /action=\{deleteTemplate/)
  assert.match(list, /resolveTemplateSwipe/)
  assert.match(list, /startWorkoutFromTemplate\(template\.id, localDateStr\(\)\)/)
  assert.match(list, /setPendingDelete\(template\)/)
  assert.match(list, /destructive/)
  assert.match(list, /Delete template permanently/)
  assert.match(list, /Swipe right to delete/)
  assert.match(list, /Swipe left to start/)
  assert.match(list, /aria-expanded=\{actionsOpen\}/)
  assert.match(list, /Delete…/)
  assert.match(list, /onPointerCancel/)
  assert.match(list, /Date\.now\(\) \+ 500/)
  assert.match(list, /setVisibleTemplates/)
  assert.match(list, /role="alert"/)
  assert.match(actions, /if \(error \|\| !data\)/)
  assert.match(actions, /return \{ success: true \}/)
})

test('both list and editor deletion require the shared confirmation modal', async () => {
  const [list, editor] = await Promise.all([
    readFile(new URL('../src/app/workouts/TemplateSwipeList.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/workouts/[id]/TemplateEditor.tsx', import.meta.url), 'utf8'),
  ])

  for (const source of [list, editor]) {
    assert.match(source, /<Modal/)
    assert.match(source, /destructive/)
    assert.match(source, /Delete template permanently/)
    assert.match(source, /deleteTemplate\(/)
  }
  assert.match(editor, /setShowDeleteConfirm\(true\)/)
  assert.match(editor, /router\.push\('\/workouts'\)/)
})
