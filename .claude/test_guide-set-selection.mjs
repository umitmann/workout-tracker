import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  buildGuideRows,
  guideAllRows,
  guidePendingRows,
  setAllSelectedMaxMode,
  selectedGuideRows,
} = await import('../src/lib/guideSetSelection.ts')

const sets = [
  { localId: 'done', reps: 8, weight: 60, done: true, note: null },
  { localId: 'pending-a', reps: 8, weight: 60, done: false, note: 'brace' },
  { localId: 'pending-b', reps: 10, weight: 55, done: false, note: null },
]

test('guide setup defaults to unfinished sets, so one logged set can be followed by guided remainder', () => {
  const rows = buildGuideRows(sets)
  assert.deepEqual(rows.map((row) => row.selected), [false, true, true])
  assert.deepEqual(selectedGuideRows(rows).map((row) => row.localId), ['pending-a', 'pending-b'])
})

test('Guide all and Guide pending are explicit reversible bulk choices', () => {
  assert.ok(guideAllRows(buildGuideRows(sets)).every((row) => row.selected))
  assert.deepEqual(guidePendingRows(guideAllRows(buildGuideRows(sets))).map((row) => row.selected), [false, true, true])
})

test('Max all affects selected rows only and individual max choices survive', () => {
  const rows = buildGuideRows(sets).map((row) => row.localId === 'pending-b' ? { ...row, maxMode: true } : row)
  const maxed = setAllSelectedMaxMode(rows, true)
  assert.equal(maxed[0].maxMode, false)
  assert.equal(maxed[1].maxMode, true)
  assert.equal(maxed[2].maxMode, true)
  assert.deepEqual(selectedGuideRows(maxed).map(({ localId, maxMode }) => ({ localId, maxMode })), [
    { localId: 'pending-a', maxMode: true },
    { localId: 'pending-b', maxMode: true },
  ])
})
