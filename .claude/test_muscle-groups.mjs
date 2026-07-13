/**
 * Unit tests for muscleGroups — scenario: muscle-group-picker
 * Run: node --experimental-strip-types --test .claude/test_muscle-groups.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { MUSCLE_GROUPS, muscleGroupOf, musclesForGroup, countByGroup } = await import(
  '../src/lib/muscleGroups.ts'
)

const DB = [
  { id: 1, name: 'Bench Press', category: 'strength', muscles: ['chest', 'triceps'] },
  { id: 2, name: 'Lat Pulldown', category: 'strength', muscles: ['lats'] },
  { id: 3, name: 'Squat', category: 'strength', muscles: ['quadriceps', 'glutes'] },
  { id: 4, name: 'Bicep Curl', category: 'strength', muscles: ['biceps'] },
  { id: 5, name: 'Running', category: 'cardio', muscles: null },
]

test('every group has a key, label, and at least one muscle', () => {
  for (const g of MUSCLE_GROUPS) {
    assert.ok(g.key && g.label && Array.isArray(g.muscles) && g.muscles.length > 0)
  }
})

test('muscleGroupOf maps a raw muscle to its group key', () => {
  assert.equal(muscleGroupOf('chest'), 'chest')
  assert.equal(muscleGroupOf('lats'), 'back')
  assert.equal(muscleGroupOf('biceps'), 'arms')
  assert.equal(muscleGroupOf('quadriceps'), 'legs')
})

test('muscleGroupOf returns null for unknown muscle', () => {
  assert.equal(muscleGroupOf('tentacles'), null)
})

test('musclesForGroup returns the raw muscles for a group key', () => {
  assert.deepEqual(musclesForGroup('chest'), ['chest'])
  assert.ok(musclesForGroup('back').includes('lats'))
})

test('every seed muscle belongs to exactly one group', () => {
  const SEED_MUSCLES = [
    'abdominals','abductors','adductors','biceps','calves','chest','forearms',
    'glutes','hamstrings','lats','lower back','middle back','neck','quadriceps',
    'shoulders','traps','triceps',
  ]
  for (const m of SEED_MUSCLES) {
    const g = muscleGroupOf(m)
    assert.ok(g !== null, `${m} should belong to a group`)
    const matches = MUSCLE_GROUPS.filter((grp) => grp.muscles.includes(m))
    assert.equal(matches.length, 1, `${m} should be in exactly one group`)
  }
})

test('countByGroup counts exercises whose primary muscles hit the group', () => {
  const counts = countByGroup(DB)
  assert.equal(counts.chest, 1) // Bench Press
  assert.equal(counts.back, 1) // Lat Pulldown
  assert.equal(counts.legs, 1) // Squat
  assert.equal(counts.arms, 2) // Bench Press (triceps) + Bicep Curl
})

test('countByGroup ignores exercises without muscles', () => {
  const counts = countByGroup([{ id: 9, name: 'Running', category: 'cardio', muscles: null }])
  for (const g of MUSCLE_GROUPS) assert.equal(counts[g.key] ?? 0, 0)
})
