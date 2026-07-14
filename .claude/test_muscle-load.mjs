import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  calculateMuscleLoad,
  effectiveProgrammedSets,
  PRIMARY_MUSCLE_FACTOR,
  SECONDARY_MUSCLE_FACTOR,
} from '../src/lib/muscleLoad.ts'

const catalog = [
  {
    id: 1,
    name: 'Back squat',
    muscles: ['quadriceps', 'glutes'],
    muscles_secondary: ['hamstrings', 'glutes'],
  },
  {
    id: 2,
    name: 'Bench press',
    muscles: ['chest'],
    muscles_secondary: ['triceps', 'shoulders'],
  },
  {
    id: 3,
    name: 'Mystery movement',
    muscles: ['serratus anterior'],
    muscles_secondary: null,
  },
]

test('the load model publishes its transparent primary and secondary factors', () => {
  assert.equal(PRIMARY_MUSCLE_FACTOR, 1)
  assert.equal(SECONDARY_MUSCLE_FACTOR, 0.5)
})

test('effective sets use per-set rows when present and otherwise uniform sets', () => {
  assert.equal(effectiveProgrammedSets({ sets: 3, setDetails: null }), 3)
  assert.equal(effectiveProgrammedSets({ sets: 9, setDetails: [{}, {}, {}, {}] }), 4)
  assert.equal(effectiveProgrammedSets({ sets: -2, setDetails: null }), 0)
  assert.equal(effectiveProgrammedSets({ sets: Number.NaN, setDetails: null }), 0)
})

test('primary and secondary exposure aggregate across selected exercises', () => {
  const result = calculateMuscleLoad(
    [
      { exerciseId: 1, sets: 4, setDetails: null },
      { exerciseId: 2, sets: 2, setDetails: [{}, {}, {}] },
    ],
    catalog,
  )

  assert.deepEqual(result.byMuscle.quadriceps, {
    muscle: 'quadriceps',
    primarySets: 4,
    secondarySets: 0,
    score: 4,
    percentage: 100,
    exerciseIds: [1],
  })
  assert.equal(result.byMuscle.chest.score, 3)
  assert.equal(result.byMuscle.chest.percentage, 75)
  assert.equal(result.byMuscle.triceps.score, 1.5)
  assert.equal(result.byMuscle.triceps.percentage, 38)
  assert.equal(result.totalProgrammedSets, 7)
})

test('a muscle listed as both primary and secondary is counted as primary once', () => {
  const result = calculateMuscleLoad(
    [{ exerciseId: 1, sets: 4, setDetails: null }],
    catalog,
  )

  assert.equal(result.byMuscle.glutes.primarySets, 4)
  assert.equal(result.byMuscle.glutes.secondarySets, 0)
  assert.equal(result.byMuscle.glutes.score, 4)
})

test('duplicate and case-varied muscle names are normalized without double counting', () => {
  const result = calculateMuscleLoad(
    [{ exerciseId: 9, sets: 2, setDetails: null }],
    [{ id: 9, name: 'Curl', muscles: [' Biceps ', 'biceps'], muscles_secondary: ['BICEPS', 'forearms'] }],
  )

  assert.deepEqual(Object.keys(result.byMuscle).sort(), ['biceps', 'forearms'])
  assert.equal(result.byMuscle.biceps.score, 2)
  assert.equal(result.byMuscle.forearms.score, 1)
})

test('unknown muscles remain visible and missing catalog metadata is reported', () => {
  const result = calculateMuscleLoad(
    [
      { exerciseId: 3, sets: 2, setDetails: null },
      { exerciseId: 404, sets: 5, setDetails: null },
    ],
    catalog,
  )

  assert.equal(result.byMuscle['serratus anterior'].score, 2)
  assert.deepEqual(result.unclassifiedExerciseIds, [404])
})

test('empty and zero-set plans return finite zero totals', () => {
  assert.deepEqual(calculateMuscleLoad([], catalog), {
    muscles: [],
    byMuscle: {},
    maxScore: 0,
    totalProgrammedSets: 0,
    unclassifiedExerciseIds: [],
  })

  const zero = calculateMuscleLoad([{ exerciseId: 1, sets: 0, setDetails: null }], catalog)
  assert.equal(zero.maxScore, 0)
  assert.equal(zero.muscles.length, 0)
})

test('load calculation does not mutate editor state or catalog metadata', () => {
  const items = [{ exerciseId: 1, sets: 3, setDetails: null }]
  const itemSnapshot = structuredClone(items)
  const catalogSnapshot = structuredClone(catalog)
  calculateMuscleLoad(items, catalog)
  assert.deepEqual(items, itemSnapshot)
  assert.deepEqual(catalog, catalogSnapshot)
})
