import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const { DataAccessError, isNoRowsError, requireQueryData } = await import(
  '../src/lib/dataAccessError.ts'
)

test('requireQueryData returns successful data, including intentional null', () => {
  assert.deepEqual(requireQueryData({ data: [1, 2], error: null }, 'list workouts'), [1, 2])
  assert.equal(requireQueryData({ data: null, error: null }, 'find workout'), null)
})

test('requireQueryData throws a contextual error instead of presenting failure as empty data', () => {
  const databaseError = {
    code: 'PGRST201',
    message: 'Could not embed because more than one relationship was found',
    details: 'relationships are ambiguous',
  }

  assert.throws(
    () => requireQueryData({ data: null, error: databaseError }, 'list calendar workouts'),
    (error) => {
      assert.ok(error instanceof DataAccessError)
      assert.equal(error.name, 'DataAccessError')
      assert.equal(error.operation, 'list calendar workouts')
      assert.equal(error.code, 'PGRST201')
      assert.match(error.message, /list calendar workouts failed \(PGRST201\)/)
      assert.equal(error.cause, databaseError)
      return true
    },
  )
})

test('isNoRowsError distinguishes an expected single-row miss from real query failures', () => {
  assert.equal(isNoRowsError({ code: 'PGRST116', message: 'zero rows' }), true)
  assert.equal(isNoRowsError({ code: 'PGRST201', message: 'ambiguous relationship' }), false)
  assert.equal(isNoRowsError(null), false)
})

test('critical workout and template reads route failures through the visible error boundary', async () => {
  const source = await readFile(new URL('../src/lib/dal.ts', import.meta.url), 'utf8')
  for (const operation of [
    'list recent workouts',
    'load workout',
    'load workout sets',
    'list workout templates',
    'load workout template',
    'list calendar workouts',
    'list calendar workouts with previews',
  ]) {
    assert.match(source, new RegExp(`requireQueryData\\([^;]+['"]${operation}['"]`, 's'))
  }
})

test('new and pasted templates surface atomic snapshot failures before navigating', async () => {
  const editor = await readFile(
    new URL('../src/app/workouts/[id]/TemplateEditor.tsx', import.meta.url),
    'utf8',
  )
  const pasteButton = await readFile(
    new URL('../src/app/workouts/PasteTemplateButton.tsx', import.meta.url),
    'utf8',
  )

  assert.equal(
    editor.match(/const saved = await saveTemplateExercises\(/g)?.length,
    2,
    'both new-template flows must inspect the atomic save result',
  )
  assert.equal(
    editor.match(/if \('error' in saved\) \{ setError\(saved\.error \?\? 'Save failed'\); return \}/g)?.length,
    2,
    'both new-template flows must stop and show an atomic save failure',
  )
  assert.match(pasteButton, /const saved = await saveTemplateExercises\(/)
  assert.match(pasteButton, /if \('error' in saved\)/)
  assert.match(pasteButton, /setError\(saved\.error \?\? 'Could not save template'\)/)
  assert.match(pasteButton, /role="alert"/)
})
