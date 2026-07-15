/**
 * Contract tests for the deterministic workout-composition engine.
 *
 * These tests intentionally precede the production module. They describe the
 * small, pure API used by the optional "Guide me" workflow without coupling it
 * to React or persistence.
 *
 * Run: node --import tsx --test .claude/test_workout-composition.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  analyzeWeeklyComposition,
  createTrainingBlueprint,
  normalizeCompositionQuestionnaire,
  suggestNextExercises,
} from '../src/lib/workoutComposition.ts'

const catalog = [
  {
    id: 1,
    name: 'Barbell back squat',
    category: 'strength',
    equipment: 'barbell',
    muscles: ['quadriceps', 'glutes'],
    muscles_secondary: ['hamstrings'],
    movement_patterns: ['knee_dominant'],
    variation_family: 'squat',
    skill_level: 'intermediate',
    compound: true,
  },
  {
    id: 2,
    name: 'Goblet squat',
    category: 'strength',
    equipment: 'dumbbell',
    muscles: ['quadriceps', 'glutes'],
    muscles_secondary: ['hamstrings'],
    movement_patterns: ['knee_dominant'],
    variation_family: 'squat',
    skill_level: 'beginner',
    compound: true,
  },
  {
    id: 3,
    name: 'Reverse lunge',
    category: 'strength',
    equipment: 'dumbbell',
    muscles: ['quadriceps', 'glutes'],
    muscles_secondary: ['hamstrings'],
    movement_patterns: ['knee_dominant', 'unilateral_lower'],
    variation_family: 'lunge',
    skill_level: 'beginner',
    compound: true,
  },
  {
    id: 4,
    name: 'Dumbbell Romanian deadlift',
    category: 'strength',
    equipment: 'dumbbell',
    muscles: ['hamstrings', 'glutes'],
    muscles_secondary: ['lower back'],
    movement_patterns: ['hip_hinge'],
    variation_family: 'romanian_deadlift',
    skill_level: 'beginner',
    compound: true,
  },
  {
    id: 5,
    name: 'One-arm dumbbell row',
    category: 'strength',
    equipment: 'dumbbell',
    muscles: ['middle back', 'lats'],
    muscles_secondary: ['biceps'],
    movement_patterns: ['horizontal_pull'],
    variation_family: 'row',
    skill_level: 'beginner',
    compound: true,
  },
  {
    id: 6,
    name: 'Dumbbell bench press',
    category: 'strength',
    equipment: 'dumbbell',
    muscles: ['chest'],
    muscles_secondary: ['triceps', 'shoulders'],
    movement_patterns: ['horizontal_push'],
    variation_family: 'bench_press',
    skill_level: 'beginner',
    compound: true,
  },
  {
    id: 7,
    name: 'Push-up',
    category: 'strength',
    equipment: 'bodyweight',
    muscles: ['chest'],
    muscles_secondary: ['triceps', 'shoulders'],
    movement_patterns: ['horizontal_push'],
    variation_family: 'push_up',
    skill_level: 'beginner',
    compound: true,
  },
  {
    id: 8,
    name: 'Dumbbell overhead press',
    category: 'strength',
    equipment: 'dumbbell',
    muscles: ['shoulders'],
    muscles_secondary: ['triceps'],
    movement_patterns: ['vertical_push'],
    variation_family: 'overhead_press',
    skill_level: 'intermediate',
    compound: true,
  },
  {
    id: 9,
    name: 'Front plank',
    category: 'strength',
    equipment: 'bodyweight',
    muscles: ['abdominals'],
    muscles_secondary: [],
    movement_patterns: ['trunk'],
    variation_family: 'plank',
    skill_level: 'beginner',
    compound: false,
  },
  {
    id: 10,
    name: 'Barbell bench press',
    category: 'strength',
    equipment: 'barbell',
    muscles: ['chest'],
    muscles_secondary: ['triceps', 'shoulders'],
    movement_patterns: ['horizontal_push'],
    variation_family: 'bench_press',
    skill_level: 'intermediate',
    compound: true,
  },
]

function questionnaire(overrides = {}) {
  return normalizeCompositionQuestionnaire({
    primaryGoal: 'general_health',
    secondaryGoal: null,
    daysPerWeek: 2,
    minutesPerSession: 45,
    experience: 'beginner',
    equipment: ['dumbbell', 'bodyweight'],
    excludedExerciseIds: [],
    excludedMovementPatterns: [],
    ...overrides,
  })
}

function generalHealthBlueprint(overrides = {}) {
  return {
    ...createTrainingBlueprint(questionnaire()),
    ...overrides,
  }
}

test('questionnaire normalization canonicalizes aliases, de-duplicates filters, clamps bounds, and does not mutate input', () => {
  const input = {
    primaryGoal: ' Muscle Growth ',
    secondaryGoal: ' MAX STRENGTH ',
    daysPerWeek: 12,
    minutesPerSession: 17,
    experience: 'Novice',
    equipment: [' Dumbbell ', 'dumbbell', ' Bench ', ''],
    excludedExerciseIds: [9, 9, -1, 0, Number.NaN],
    excludedMovementPatterns: ['Vertical Push', 'vertical_push', ''],
  }
  const snapshot = structuredClone(input)

  const normalized = normalizeCompositionQuestionnaire(input)

  assert.deepEqual(normalized, {
    primaryGoal: 'hypertrophy',
    secondaryGoal: 'strength',
    daysPerWeek: 7,
    minutesPerSession: 20,
    experience: 'beginner',
    equipment: ['bench', 'dumbbell'],
    excludedExerciseIds: [9],
    excludedMovementPatterns: ['vertical_push'],
  })
  assert.deepEqual(input, snapshot)
})

test('questionnaire normalization supplies safe optional defaults and treats bodyweight as available equipment', () => {
  assert.deepEqual(
    normalizeCompositionQuestionnaire({
      primaryGoal: 'return to training',
      daysPerWeek: 1,
      minutesPerSession: 30,
      experience: 'beginner',
    }),
    {
      primaryGoal: 'return_to_training',
      secondaryGoal: null,
      daysPerWeek: 1,
      minutesPerSession: 30,
      experience: 'beginner',
      equipment: ['bodyweight'],
      excludedExerciseIds: [],
      excludedMovementPatterns: [],
    },
  )
})

test('goal, availability, and session length map to an explainable full-body health blueprint', () => {
  const result = createTrainingBlueprint(questionnaire())

  assert.equal(result.primaryGoal, 'general_health')
  assert.deepEqual(result.trainingTypes, ['resistance', 'aerobic'])
  assert.equal(result.split, 'full_body')
  assert.equal(result.frequencyPerWeek, 2)
  assert.deepEqual(result.exerciseCount, { min: 5, max: 6 })
  assert.deepEqual(result.requiredMovementPatterns, [
    'knee_dominant',
    'hip_hinge',
    'horizontal_push',
    'horizontal_pull',
    'trunk',
  ])
  assert.deepEqual(result.prescription.repRange, { min: 8, max: 12 })
  assert.equal(result.prescription.sets, 2)
  assert.match(result.explanation, /full.body/i)
})

test('hypertrophy and strength goals produce distinct splits and prescriptions', () => {
  const hypertrophy = createTrainingBlueprint(
    questionnaire({ primaryGoal: 'hypertrophy', daysPerWeek: 4, minutesPerSession: 60 }),
  )
  const strength = createTrainingBlueprint(
    questionnaire({ primaryGoal: 'strength', daysPerWeek: 3, minutesPerSession: 60 }),
  )

  assert.deepEqual(hypertrophy.trainingTypes, ['hypertrophy'])
  assert.equal(hypertrophy.split, 'upper_lower')
  assert.equal(hypertrophy.frequencyPerWeek, 4)
  assert.equal(hypertrophy.weeklyMuscleSetTarget.min, 10)
  assert.deepEqual(hypertrophy.prescription.repRange, { min: 6, max: 15 })

  assert.deepEqual(strength.trainingTypes, ['strength'])
  assert.equal(strength.split, 'full_body')
  assert.deepEqual(strength.prescription.repRange, { min: 3, max: 6 })
  assert.ok(strength.prescription.restSeconds.min >= 120)
})

test('weekly analysis reports direct, secondary, effective set exposure and session frequency without double-counting a session', () => {
  const result = analyzeWeeklyComposition({
    catalog,
    sessions: [
      {
        id: 'a',
        exercises: [
          { exerciseId: 1, sets: 3 },
          { exerciseId: 3, sets: 2 },
          { exerciseId: 6, sets: 3 },
        ],
      },
      { id: 'b', exercises: [{ exerciseId: 2, sets: 4 }] },
    ],
  })

  assert.deepEqual(result.byMuscle.quadriceps, {
    directSets: 9,
    secondarySets: 0,
    effectiveSets: 9,
    frequency: 2,
  })
  assert.deepEqual(result.byMuscle.triceps, {
    directSets: 0,
    secondarySets: 3,
    effectiveSets: 1.5,
    frequency: 1,
  })
  assert.equal(result.totalProgrammedSets, 12)
})

test('one round prioritizes the first missing movement gap and returns only one to three matching choices', () => {
  const result = suggestNextExercises({
    questionnaire: questionnaire(),
    blueprint: generalHealthBlueprint(),
    catalog,
    selectedExercises: [
      { exerciseId: 6, sets: 2 },
      { exerciseId: 5, sets: 2 },
    ],
    weeklySessions: [],
    minutesUsed: 10,
  })

  assert.equal(result.status, 'suggestions')
  assert.deepEqual(result.need, {
    kind: 'movement_gap',
    key: 'knee_dominant',
    label: 'Knee-dominant lower body',
    explanation: 'This session does not yet include a knee-dominant lower-body exercise.',
  })
  assert.ok(result.suggestions.length >= 1 && result.suggestions.length <= 3)
  assert.ok(result.suggestions.every((item) => item.movementPatterns.includes('knee_dominant')))
})

test('suggestions enforce available equipment and explicit exercise or movement exclusions before scoring', () => {
  const result = suggestNextExercises({
    questionnaire: questionnaire({
      equipment: ['bodyweight', 'dumbbell'],
      excludedExerciseIds: [2],
      excludedMovementPatterns: ['unilateral_lower'],
    }),
    blueprint: generalHealthBlueprint(),
    catalog,
    selectedExercises: [],
    weeklySessions: [],
    minutesUsed: 0,
  })

  assert.equal(result.status, 'suggestions')
  assert.ok(!result.suggestions.some((item) => item.exerciseId === 1), 'barbell-only exercise leaked')
  assert.ok(!result.suggestions.some((item) => item.exerciseId === 2), 'explicitly excluded exercise leaked')
  assert.ok(!result.suggestions.some((item) => item.exerciseId === 3), 'excluded movement leaked')
})

test('suggestions never repeat an already selected exercise or variation family', () => {
  const result = suggestNextExercises({
    questionnaire: questionnaire(),
    blueprint: generalHealthBlueprint({
      requiredMovementPatterns: ['horizontal_push'],
      exerciseCount: { min: 2, max: 4 },
    }),
    catalog,
    selectedExercises: [{ exerciseId: 6, sets: 1 }],
    weeklySessions: [],
    minutesUsed: 5,
  })

  const ids = result.suggestions.map((item) => item.exerciseId)
  assert.ok(!ids.includes(6), 'selected exercise was suggested again')
  assert.ok(!ids.includes(10), 'selected bench-press variation family was suggested again')
})

test('scores, tie-breaking, reasons, and prescriptions are deterministic and explainable', () => {
  const input = {
    questionnaire: questionnaire(),
    blueprint: generalHealthBlueprint(),
    catalog,
    selectedExercises: [],
    weeklySessions: [],
    minutesUsed: 0,
  }
  const inputSnapshot = structuredClone(input)

  const first = suggestNextExercises(input)
  const second = suggestNextExercises(structuredClone(input))

  assert.deepEqual(first, second)
  assert.deepEqual(input, inputSnapshot)
  assert.ok(first.suggestions.every((item) => Number.isFinite(item.score)))
  assert.ok(first.suggestions.every((item) => item.reasonCodes.includes('fills_movement_gap')))
  assert.ok(first.suggestions.every((item) => item.explanation.trim().length > 0))
  assert.ok(first.suggestions.every((item) => item.prescription.sets >= 1))
  for (let index = 1; index < first.suggestions.length; index += 1) {
    const previous = first.suggestions[index - 1]
    const current = first.suggestions[index]
    assert.ok(
      previous.score > current.score ||
        (previous.score === current.score && previous.exerciseId < current.exerciseId),
      'suggestions must sort by descending score and then stable exercise id',
    )
  }
})

test('weekly underexposure becomes the next need only after required session movement patterns are covered', () => {
  const blueprint = generalHealthBlueprint({
    weeklyMuscleSetTarget: { min: 6, max: 12 },
    minimumMuscleFrequency: 2,
  })
  const selectedExercises = [
    { exerciseId: 2, sets: 2 },
    { exerciseId: 4, sets: 2 },
    { exerciseId: 6, sets: 2 },
    { exerciseId: 5, sets: 2 },
    { exerciseId: 9, sets: 2 },
  ]
  const result = suggestNextExercises({
    questionnaire: questionnaire(),
    blueprint,
    catalog,
    selectedExercises,
    weeklySessions: [{ id: 'today', exercises: selectedExercises }],
    minutesUsed: 30,
  })

  assert.equal(result.status, 'suggestions')
  assert.equal(result.need.kind, 'weekly_muscle_gap')
  assert.equal(result.need.key, 'quadriceps')
  assert.match(result.need.explanation, /weekly|frequency|sets/i)
})

test('a sufficiently composed session stops with no suggestions', () => {
  const selectedExercises = [
    { exerciseId: 2, sets: 3 },
    { exerciseId: 4, sets: 3 },
    { exerciseId: 6, sets: 3 },
    { exerciseId: 5, sets: 3 },
    { exerciseId: 9, sets: 3 },
  ]
  const result = suggestNextExercises({
    questionnaire: questionnaire(),
    blueprint: generalHealthBlueprint({ weeklyMuscleSetTarget: { min: 0, max: 12 } }),
    catalog,
    selectedExercises,
    weeklySessions: [{ id: 'today', exercises: selectedExercises }],
    minutesUsed: 35,
  })

  assert.equal(result.status, 'complete')
  assert.equal(result.need, null)
  assert.deepEqual(result.suggestions, [])
  assert.equal(result.stopReason, 'composition_complete')
})

test('the time budget is a hard stop even when a movement gap remains', () => {
  const result = suggestNextExercises({
    questionnaire: questionnaire({ minutesPerSession: 20 }),
    blueprint: generalHealthBlueprint({ minutesPerSession: 20 }),
    catalog,
    selectedExercises: [{ exerciseId: 6, sets: 2 }],
    weeklySessions: [],
    minutesUsed: 18,
  })

  assert.equal(result.status, 'time_limit')
  assert.equal(result.need, null)
  assert.deepEqual(result.suggestions, [])
  assert.equal(result.stopReason, 'session_time_exhausted')
})

test('missing equipment metadata is never assumed to mean bodyweight', () => {
  const result = suggestNextExercises({
    questionnaire: questionnaire({ equipment: ['bodyweight'] }),
    blueprint: generalHealthBlueprint(),
    catalog: [{
      id: 99,
      name: 'Untagged squat',
      category: 'strength',
      equipment: null,
      muscles: ['quadriceps'],
      muscles_secondary: [],
      movement_patterns: ['knee_dominant'],
      variation_family: 'untagged_squat',
      skill_level: 'beginner',
      compound: true,
    }],
    selectedExercises: [],
    weeklySessions: [],
    minutesUsed: 0,
  })

  assert.equal(result.status, 'complete')
  assert.equal(result.stopReason, 'no_matching_exercises')
  assert.deepEqual(result.suggestions, [])
})
