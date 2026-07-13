/**
 * Unit tests for Tile 4/13 (D8): lossless per-set clipboard copy -> paste
 * round-trip, and the shared Overwrite/Append merge rule used by both Paste
 * and Import. Scenario: logging-screen-inventory Tiles 4 & 13.
 * Run: node --import tsx --test .claude/test_clipboard-perset-import.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { buildClipboardEntries, clipboardEntriesToLocalSets } = await import('../src/lib/clipboardOps.ts')
const { mergeIncomingSets } = await import('../src/lib/setListOps.ts')

function localSet(overrides = {}) {
  return {
    localId: overrides.localId ?? 'id',
    exerciseId: overrides.exerciseId ?? 10,
    exerciseName: overrides.exerciseName ?? 'Bench',
    exerciseCategory: overrides.exerciseCategory ?? null,
    weight: overrides.weight ?? null,
    reps: overrides.reps ?? null,
    duration_minutes: overrides.duration_minutes ?? null,
    distance: overrides.distance ?? null,
    rest_seconds: overrides.rest_seconds ?? null,
    difficulty: overrides.difficulty ?? null,
    done: overrides.done ?? false,
  }
}

test('buildClipboardEntries: captures every set its own weight/reps, in order — no flattening', () => {
  const sets = [
    localSet({ localId: 'a', exerciseId: 1, exerciseName: 'Squat', weight: 60, reps: 10, done: true }),
    localSet({ localId: 'b', exerciseId: 1, exerciseName: 'Squat', weight: 60, reps: 8, done: true }),
    localSet({ localId: 'c', exerciseId: 1, exerciseName: 'Squat', weight: 50, reps: 6, done: true }),
  ]
  const grouped = { 1: { name: 'Squat', sets } }
  const entries = buildClipboardEntries([1], grouped)

  assert.equal(entries.length, 1)
  assert.deepEqual(entries[0].sets, [
    { weight: 60, reps: 10 },
    { weight: 60, reps: 8 },
    { weight: 50, reps: 6 },
  ])
  // The old model could only represent "3 x 60x10" — assert it does NOT.
  assert.notDeepEqual(entries[0].sets, [
    { weight: 60, reps: 10 },
    { weight: 60, reps: 10 },
    { weight: 60, reps: 10 },
  ])
})

test('buildClipboardEntries: identical regardless of which view (active/completed/editing) copied it', () => {
  // The function only depends on grouped/exerciseOrder — the same shape is
  // fed by every view, so lossless-ness is state-independent by construction.
  const sets = [
    localSet({ localId: 'a', exerciseId: 2, exerciseName: 'Row', weight: 40, reps: 12 }),
    localSet({ localId: 'b', exerciseId: 2, exerciseName: 'Row', weight: 45, reps: 10 }),
  ]
  const grouped = { 2: { name: 'Row', sets } }
  const fromActive = buildClipboardEntries([2], grouped)
  const fromCompleted = buildClipboardEntries([2], grouped)
  assert.deepEqual(fromActive, fromCompleted)
})

test('copy -> paste round-trip: rebuilds real per-set rows, not setCount x one pair', () => {
  const sets = [
    localSet({ localId: 'a', exerciseId: 1, exerciseName: 'Squat', weight: 60, reps: 10, done: true, difficulty: 4 }),
    localSet({ localId: 'b', exerciseId: 1, exerciseName: 'Squat', weight: 60, reps: 8, done: true, difficulty: 5 }),
    localSet({ localId: 'c', exerciseId: 1, exerciseName: 'Squat', weight: 50, reps: 6, done: true, rest_seconds: 90 }),
  ]
  const entries = buildClipboardEntries([1], { 1: { name: 'Squat', sets } })
  let counter = 0
  const pasted = clipboardEntriesToLocalSets(entries, () => `new-${counter++}`)

  assert.equal(pasted.length, 3)
  assert.deepEqual(
    pasted.map((s) => [s.weight, s.reps]),
    [
      [60, 10],
      [60, 8],
      [50, 6],
    ],
  )
  // Pasted sets are always fresh — never carry over done/difficulty/rest.
  for (const s of pasted) {
    assert.equal(s.done, false)
    assert.equal(s.difficulty, null)
    assert.equal(s.rest_seconds, null)
    assert.equal(s.exerciseId, 1)
    assert.equal(s.exerciseName, 'Squat')
  }
  // Fresh localIds, not reused from the source.
  assert.deepEqual(pasted.map((s) => s.localId), ['new-0', 'new-1', 'new-2'])
})

test('copy -> paste round-trip: multi-exercise order preserved', () => {
  const squat = [localSet({ localId: 'a', exerciseId: 1, exerciseName: 'Squat', weight: 100, reps: 5 })]
  const bench = [
    localSet({ localId: 'b', exerciseId: 2, exerciseName: 'Bench', weight: 70, reps: 8 }),
    localSet({ localId: 'c', exerciseId: 2, exerciseName: 'Bench', weight: 75, reps: 6 }),
  ]
  const entries = buildClipboardEntries([1, 2], { 1: { name: 'Squat', sets: squat }, 2: { name: 'Bench', sets: bench } })
  const pasted = clipboardEntriesToLocalSets(entries)

  assert.deepEqual(
    pasted.map((s) => [s.exerciseId, s.weight, s.reps]),
    [
      [1, 100, 5],
      [2, 70, 8],
      [2, 75, 6],
    ],
  )
})

test('mergeIncomingSets: overwrite replaces everything', () => {
  const existing = [localSet({ localId: 'warmup', exerciseId: 9, weight: 20, reps: 15 })]
  const incoming = [localSet({ localId: 'new', exerciseId: 1, weight: 60, reps: 10 })]
  const result = mergeIncomingSets(existing, incoming, 'overwrite')
  assert.deepEqual(result, incoming)
})

test('mergeIncomingSets: append keeps existing sets and adds incoming after', () => {
  const existing = [localSet({ localId: 'warmup', exerciseId: 9, weight: 20, reps: 15 })]
  const incoming = [
    localSet({ localId: 'new1', exerciseId: 1, weight: 60, reps: 10 }),
    localSet({ localId: 'new2', exerciseId: 1, weight: 60, reps: 8 }),
  ]
  const result = mergeIncomingSets(existing, incoming, 'append')
  assert.equal(result.length, 3)
  assert.equal(result[0].localId, 'warmup')
  assert.deepEqual(result.slice(1), incoming)
})

test('mergeIncomingSets: append preserves internal order of both lists', () => {
  const existing = [
    localSet({ localId: 'e1', exerciseId: 9, weight: 20, reps: 15 }),
    localSet({ localId: 'e2', exerciseId: 9, weight: 22, reps: 12 }),
  ]
  const incoming = [
    localSet({ localId: 'i1', exerciseId: 1, weight: 60, reps: 10 }),
    localSet({ localId: 'i2', exerciseId: 1, weight: 60, reps: 8 }),
  ]
  const result = mergeIncomingSets(existing, incoming, 'append')
  assert.deepEqual(
    result.map((s) => s.localId),
    ['e1', 'e2', 'i1', 'i2'],
  )
})
