/**
 * Unit tests for D10 — nav-edit-completed (Tiles 1, 15).
 *
 * Tile 15: entering Edit on a completed workout captures a pre-edit snapshot
 * of localSets; Back -> Discard restores that snapshot exactly, reverting
 * every edit made since (including ones that already autosaved). Covers the
 * pure `restoreSnapshot` helper WorkoutLogger.tsx uses for the capture/revert.
 *
 * Tile 1: no "abandon"/"your sets will not be saved" wording remains
 * anywhere in the logging screen source — leaving an active workout always
 * saves; only the explicit two-step Delete destroys data.
 *
 * Run: node --import tsx --test .claude/test_nav-edit-completed.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const { restoreSnapshot, applyEdit, addSet, deleteSet, setDifficulty } = await import('../src/lib/setListOps.ts')

function set(overrides = {}) {
  return {
    localId: overrides.localId ?? 'id',
    exerciseId: overrides.exerciseId ?? 1,
    exerciseName: overrides.exerciseName ?? 'Bench Press',
    exerciseCategory: overrides.exerciseCategory ?? null,
    weight: overrides.weight ?? null,
    reps: overrides.reps ?? null,
    duration_minutes: overrides.duration_minutes ?? null,
    distance: overrides.distance ?? null,
    rest_seconds: overrides.rest_seconds ?? null,
    difficulty: overrides.difficulty ?? null,
    done: overrides.done ?? true,
  }
}

// ─── restoreSnapshot (Tile 15: edit-completed snapshot/discard) ────────────

test('restoreSnapshot returns a value equal to the captured snapshot', () => {
  const snapshot = [set({ localId: 'a', weight: 60, reps: 10 }), set({ localId: 'b', weight: 40, reps: 12 })]
  const restored = restoreSnapshot(snapshot)
  assert.deepEqual(restored, snapshot)
})

test('restoreSnapshot returns fresh objects/array, not the same references (mutating the restored value cannot corrupt the stored snapshot)', () => {
  const snapshot = [set({ localId: 'a', weight: 60 })]
  const restored = restoreSnapshot(snapshot)
  assert.notEqual(restored, snapshot)
  assert.notEqual(restored[0], snapshot[0])
  restored[0].weight = 999
  assert.equal(snapshot[0].weight, 60) // original snapshot untouched
})

test('discard flow: edits (weight change, add, delete, difficulty) made after the snapshot are fully reverted by restoreSnapshot', () => {
  const snapshot = [
    set({ localId: 'a', weight: 60, reps: 10 }),
    set({ localId: 'b', weight: 40, reps: 12 }),
  ]
  const captured = restoreSnapshot(snapshot) // captured on entering Edit

  // Simulate a series of edits made (and already autosaved) during the
  // editing session.
  let working = applyEdit(snapshot, 'a', { weight: 999 })
  working = addSet(working, set({ localId: 'c', weight: 20, reps: 20 }))
  working = deleteSet(working, 'b')
  working = setDifficulty(working, 'a', 5)
  assert.notDeepEqual(working, snapshot)

  // Back -> Discard restores the captured snapshot exactly, as if none of
  // the above ever happened.
  const discarded = restoreSnapshot(captured)
  assert.deepEqual(discarded, [
    set({ localId: 'a', weight: 60, reps: 10 }),
    set({ localId: 'b', weight: 40, reps: 12 }),
  ])
})

test('restoreSnapshot on an empty pre-edit snapshot restores to empty (edits added during the session are fully dropped)', () => {
  const snapshot = []
  const captured = restoreSnapshot(snapshot)
  const working = addSet(snapshot, set({ localId: 'new' }))
  assert.equal(working.length, 1)
  const discarded = restoreSnapshot(captured)
  assert.deepEqual(discarded, [])
})

// ─── No "abandon" / "will not be saved" copy anywhere in the logging screen ─

const loggerPath = fileURLToPath(new URL('../src/app/workout/[id]/WorkoutLogger.tsx', import.meta.url))
const loggerSrc = readFileSync(loggerPath, 'utf8')

test('WorkoutLogger.tsx contains no "abandon" wording (Tile 1: leaving never implies data loss)', () => {
  assert.doesNotMatch(loggerSrc, /abandon/i)
})

test('WorkoutLogger.tsx contains no "will not be saved" wording', () => {
  assert.doesNotMatch(loggerSrc, /will not be saved/i)
})

test('WorkoutLogger.tsx offers the Tile 1 Back sheet: Save & leave + Delete workout', () => {
  assert.match(loggerSrc, /Save\s*&(amp;)?\s*leave/)
  assert.match(loggerSrc, /Delete workout/)
})

test('WorkoutLogger.tsx gates delete behind a second confirm step (showDeleteConfirm)', () => {
  assert.match(loggerSrc, /showDeleteConfirm/)
  assert.match(loggerSrc, /Are you sure\?/)
})

test('WorkoutLogger.tsx header reads "Editing" (not "Active") while editing a completed workout', () => {
  assert.match(loggerSrc, /isEditing \? 'Editing' : 'Active'/)
})

test('WorkoutLogger.tsx captures an edit snapshot via restoreSnapshot when Edit is entered', () => {
  assert.match(loggerSrc, /setEditSnapshot\(restoreSnapshot\(localSets\)\)/)
})

test('WorkoutLogger.tsx Discard handler restores and persists the captured snapshot', () => {
  const fnMatch = loggerSrc.match(/function handleDiscardEdits\(\) \{[\s\S]*?\n  \}/)
  assert.ok(fnMatch, 'handleDiscardEdits function not found')
  const body = fnMatch[0]
  assert.match(body, /restoreSnapshot\(editSnapshot\)/)
  assert.match(body, /setLocalSets\(restored\)/)
  assert.match(body, /persist\(restored\)/)
})
