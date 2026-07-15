export type CompositionGoal =
  | 'general_health'
  | 'hypertrophy'
  | 'strength'
  | 'return_to_training'
  | 'muscular_endurance'

export type CompositionExperience = 'beginner' | 'intermediate' | 'advanced'

export type MovementPattern =
  | 'knee_dominant'
  | 'hip_hinge'
  | 'horizontal_push'
  | 'horizontal_pull'
  | 'vertical_push'
  | 'vertical_pull'
  | 'unilateral_lower'
  | 'trunk'
  | 'carry'
  | 'conditioning'
  | 'accessory'

export type CompositionQuestionnaire = {
  primaryGoal: CompositionGoal
  secondaryGoal: CompositionGoal | null
  daysPerWeek: number
  minutesPerSession: number
  experience: CompositionExperience
  equipment: string[]
  excludedExerciseIds: number[]
  excludedMovementPatterns: string[]
}

export type CompositionCatalogExercise = {
  id: number
  name: string
  category?: string | null
  equipment?: string | null
  muscles?: string[] | null
  muscles_secondary?: string[] | null
  movement_patterns?: string[] | null
  variation_family?: string | null
  skill_level?: string | null
  compound?: boolean | null
}

export type ProgrammedExercise = {
  exerciseId: number
  sets: number
}

export type WeeklySession = {
  id: string | number
  exercises: ProgrammedExercise[]
}

export type TrainingBlueprint = {
  primaryGoal: CompositionGoal
  trainingTypes: string[]
  split: 'full_body' | 'upper_lower'
  frequencyPerWeek: number
  minutesPerSession: number
  exerciseCount: { min: number; max: number }
  requiredMovementPatterns: MovementPattern[]
  prescription: {
    sets: number
    repRange: { min: number; max: number }
    restSeconds: { min: number; max: number }
  }
  weeklyMuscleSetTarget: { min: number; max: number }
  minimumMuscleFrequency: number
  explanation: string
}

export type CompositionNeed = {
  kind: 'movement_gap' | 'weekly_muscle_gap'
  key: string
  label: string
  explanation: string
}

export type ExerciseSuggestion = {
  exerciseId: number
  score: number
  reasonCodes: string[]
  explanation: string
  prescription: TrainingBlueprint['prescription']
  movementPatterns: string[]
}

export type ExerciseSuggestionResult = {
  status: 'suggestions' | 'complete' | 'time_limit'
  need: CompositionNeed | null
  suggestions: ExerciseSuggestion[]
  stopReason?: 'composition_complete' | 'session_time_exhausted' | 'no_matching_exercises'
}

const GOAL_ALIASES: Record<string, CompositionGoal> = {
  'general fitness': 'general_health',
  'general health': 'general_health',
  health: 'general_health',
  hypertrophy: 'hypertrophy',
  'muscle growth': 'hypertrophy',
  'build muscle': 'hypertrophy',
  strength: 'strength',
  'max strength': 'strength',
  'get stronger': 'strength',
  'return to training': 'return_to_training',
  return: 'return_to_training',
  'muscular endurance': 'muscular_endurance',
  endurance: 'muscular_endurance',
}

const EXPERIENCE_ALIASES: Record<string, CompositionExperience> = {
  beginner: 'beginner',
  novice: 'beginner',
  new: 'beginner',
  intermediate: 'intermediate',
  'some experience': 'intermediate',
  advanced: 'advanced',
  experienced: 'advanced',
}

const MOVEMENT_LABELS: Record<string, string> = {
  knee_dominant: 'Knee-dominant lower body',
  hip_hinge: 'Hip hinge',
  horizontal_push: 'Horizontal push',
  horizontal_pull: 'Horizontal pull',
  vertical_push: 'Vertical push',
  vertical_pull: 'Vertical pull',
  unilateral_lower: 'Single-leg lower body',
  trunk: 'Trunk stability',
  carry: 'Loaded carry',
  conditioning: 'Conditioning',
  accessory: 'Accessory work',
}

const MUSCLE_PRIORITY = [
  'quadriceps',
  'hamstrings',
  'glutes',
  'chest',
  'lats',
  'middle back',
  'shoulders',
  'abdominals',
]

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function normalizeEquipment(value: unknown): string {
  const token = normalizeToken(value)
  if (['body_only', 'bodyweight', 'none', 'no_equipment'].includes(token)) return 'bodyweight'
  if (['dumbbells', 'dumbbell'].includes(token)) return 'dumbbell'
  if (['bands', 'band', 'resistance_band', 'resistance_bands'].includes(token)) return 'bands'
  return token
}

function normalizeGoal(value: unknown, fallback: CompositionGoal): CompositionGoal {
  const plain = String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ')
  return GOAL_ALIASES[plain] ?? fallback
}

function uniqueSortedStrings(values: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(values)) return [...fallback]
  return [...new Set(values.map(normalizeToken).filter(Boolean))].sort()
}

function finiteInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

export function normalizeCompositionQuestionnaire(
  input: Partial<CompositionQuestionnaire> & Record<string, unknown>,
): CompositionQuestionnaire {
  const primaryGoal = normalizeGoal(input.primaryGoal, 'general_health')
  const secondaryGoal = input.secondaryGoal == null || String(input.secondaryGoal).trim() === ''
    ? null
    : normalizeGoal(input.secondaryGoal, 'general_health')
  const experiencePlain = String(input.experience ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ')
  const equipment = [...new Set(
    (Array.isArray(input.equipment) ? input.equipment : ['bodyweight'])
      .map(normalizeEquipment)
      .filter(Boolean),
  )].sort()
  const ids = Array.isArray(input.excludedExerciseIds)
    ? input.excludedExerciseIds
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0)
    : []

  return {
    primaryGoal,
    secondaryGoal,
    daysPerWeek: finiteInteger(input.daysPerWeek, 2, 1, 7),
    minutesPerSession: finiteInteger(input.minutesPerSession, 45, 20, 180),
    experience: EXPERIENCE_ALIASES[experiencePlain] ?? 'beginner',
    equipment: equipment.length > 0 ? equipment : ['bodyweight'],
    excludedExerciseIds: [...new Set(ids)].sort((a, b) => a - b),
    excludedMovementPatterns: uniqueSortedStrings(input.excludedMovementPatterns),
  }
}

function exerciseBudget(minutes: number) {
  if (minutes <= 30) return { min: 3, max: 4 }
  if (minutes <= 55) return { min: 5, max: 6 }
  return { min: 6, max: 8 }
}

export function createTrainingBlueprint(questionnaire: CompositionQuestionnaire): TrainingBlueprint {
  const goal = questionnaire.primaryGoal
  const split: TrainingBlueprint['split'] = questionnaire.daysPerWeek >= 4 ? 'upper_lower' : 'full_body'
  const common = {
    primaryGoal: goal,
    split,
    frequencyPerWeek: questionnaire.daysPerWeek,
    minutesPerSession: questionnaire.minutesPerSession,
    exerciseCount: exerciseBudget(questionnaire.minutesPerSession),
    requiredMovementPatterns: [
      'knee_dominant',
      'hip_hinge',
      'horizontal_push',
      'horizontal_pull',
      'trunk',
    ] as MovementPattern[],
    minimumMuscleFrequency: 2,
  }

  if (goal === 'strength') {
    return {
      ...common,
      trainingTypes: ['strength'],
      prescription: { sets: 3, repRange: { min: 3, max: 6 }, restSeconds: { min: 120, max: 240 } },
      weeklyMuscleSetTarget: { min: 6, max: 12 },
      explanation: `${split === 'full_body' ? 'Full-body' : 'Upper/lower'} training distributes repeated practice across ${questionnaire.daysPerWeek} sessions.`,
    }
  }

  if (goal === 'hypertrophy') {
    return {
      ...common,
      trainingTypes: ['hypertrophy'],
      prescription: { sets: 3, repRange: { min: 6, max: 15 }, restSeconds: { min: 60, max: 120 } },
      weeklyMuscleSetTarget: { min: 10, max: 20 },
      explanation: `${split === 'full_body' ? 'Full-body' : 'Upper/lower'} training spreads muscle-building volume across ${questionnaire.daysPerWeek} sessions.`,
    }
  }

  if (goal === 'muscular_endurance') {
    return {
      ...common,
      trainingTypes: ['muscular_endurance'],
      prescription: { sets: 2, repRange: { min: 12, max: 20 }, restSeconds: { min: 30, max: 75 } },
      weeklyMuscleSetTarget: { min: 6, max: 14 },
      explanation: `${split === 'full_body' ? 'Full-body' : 'Upper/lower'} sessions use moderate loads and shorter rests to build repeatable work capacity.`,
    }
  }

  if (goal === 'return_to_training') {
    return {
      ...common,
      trainingTypes: ['resistance'],
      prescription: { sets: 2, repRange: { min: 8, max: 12 }, restSeconds: { min: 60, max: 120 } },
      weeklyMuscleSetTarget: { min: 4, max: 10 },
      explanation: `A simple ${split === 'full_body' ? 'full-body' : 'upper/lower'} structure keeps the first weeks repeatable while volume builds gradually.`,
    }
  }

  return {
    ...common,
    trainingTypes: ['resistance', 'aerobic'],
    prescription: { sets: 2, repRange: { min: 8, max: 12 }, restSeconds: { min: 60, max: 120 } },
    weeklyMuscleSetTarget: { min: 6, max: 12 },
    explanation: `A ${split === 'full_body' ? 'full-body' : 'upper/lower'} foundation distributes the major movement patterns across ${questionnaire.daysPerWeek} sessions. Add separate aerobic work for complete general-health guidance.`,
  }
}

function variationFamilyFromName(name: string): string {
  const value = name.toLowerCase()
  const families: Array<[RegExp, string]> = [
    [/romanian|\brdl\b/, 'romanian_deadlift'],
    [/deadlift|good morning|back extension/, 'deadlift'],
    [/split squat|lunge|step[ -]?up/, 'lunge'],
    [/squat|leg press|hack press/, 'squat'],
    [/bench press|chest press/, 'bench_press'],
    [/push[ -]?up/, 'push_up'],
    [/overhead press|shoulder press|military press|arnold press/, 'overhead_press'],
    [/pull[ -]?up|chin[ -]?up/, 'pull_up'],
    [/pulldown|lat pull/, 'pulldown'],
    [/\brow\b|rowing/, 'row'],
    [/plank|pallof|crunch|sit[ -]?up|rollout/, 'trunk'],
    [/carry|farmer|suitcase/, 'carry'],
  ]
  return families.find(([pattern]) => pattern.test(value))?.[1] ?? normalizeToken(name)
}

export function inferExerciseCompositionMetadata(exercise: CompositionCatalogExercise): {
  movementPatterns: string[]
  variationFamily: string
  skillLevel: CompositionExperience
  compound: boolean
} {
  const explicitPatterns = uniqueSortedStrings(exercise.movement_patterns)
  const name = exercise.name.toLowerCase()
  const category = String(exercise.category ?? '').toLowerCase()
  const primaryMuscles = (exercise.muscles ?? []).map((muscle) => muscle.toLowerCase())
  const allMuscles = [...primaryMuscles, ...(exercise.muscles_secondary ?? []).map((muscle) => muscle.toLowerCase())]
  const inferred = new Set<string>()

  if (/squat|lunge|leg press|hack squat|step[ -]?up|leg extension/.test(name)) inferred.add('knee_dominant')
  if (/deadlift|romanian|\brdl\b|good morning|hip thrust|glute bridge|pull[ -]?through|back extension/.test(name)) inferred.add('hip_hinge')
  if (/bench press|chest press|push[ -]?up|chest fly|pec deck/.test(name)) inferred.add('horizontal_push')
  if (/\brow\b|rowing|face pull|reverse fly/.test(name)) inferred.add('horizontal_pull')
  if (/overhead press|shoulder press|military press|arnold press|handstand/.test(name)) inferred.add('vertical_push')
  if (/pull[ -]?up|chin[ -]?up|pulldown|lat pull/.test(name)) inferred.add('vertical_pull')
  if (/lunge|split squat|single[ -]?leg|step[ -]?up/.test(name)) inferred.add('unilateral_lower')
  if (/plank|crunch|sit[ -]?up|ab |abdominal|rotation|russian twist|rollout|leg raise|pallof/.test(name)) inferred.add('trunk')
  if (/carry|farmer|suitcase/.test(name)) inferred.add('carry')
  if (category === 'cardio') inferred.add('conditioning')

  if (inferred.size === 0) {
    if (primaryMuscles.some((muscle) => /quadriceps/.test(muscle))) inferred.add('knee_dominant')
    else if (primaryMuscles.some((muscle) => /hamstring|glute|lower back/.test(muscle))) inferred.add('hip_hinge')
    else if (primaryMuscles.some((muscle) => /chest/.test(muscle))) inferred.add('horizontal_push')
    else if (primaryMuscles.some((muscle) => /lat|middle back|trap/.test(muscle))) inferred.add('horizontal_pull')
    else if (primaryMuscles.some((muscle) => /shoulder/.test(muscle))) inferred.add('vertical_push')
    else if (primaryMuscles.some((muscle) => /abdominal|oblique/.test(muscle))) inferred.add('trunk')
    else if (allMuscles.length > 0) inferred.add('accessory')
  }

  const skill = normalizeToken(exercise.skill_level)
  const skillLevel: CompositionExperience = skill === 'advanced'
    ? 'advanced'
    : skill === 'intermediate'
      ? 'intermediate'
      : /snatch|clean and jerk|muscle[ -]?up|pistol squat|handstand/.test(name)
        ? 'advanced'
        : 'beginner'
  const compound = exercise.compound ?? !/curl|extension|raise|fly|kickback|calf raise/.test(name)

  return {
    movementPatterns: explicitPatterns.length > 0 ? explicitPatterns : [...inferred],
    variationFamily: normalizeToken(exercise.variation_family) || variationFamilyFromName(exercise.name),
    skillLevel,
    compound,
  }
}

export function analyzeWeeklyComposition({
  catalog,
  sessions,
}: {
  catalog: CompositionCatalogExercise[]
  sessions: WeeklySession[]
}) {
  const catalogById = new Map(catalog.map((exercise) => [exercise.id, exercise]))
  const accumulator: Record<string, { directSets: number; secondarySets: number; sessions: Set<string> }> = {}
  let totalProgrammedSets = 0

  for (const session of sessions) {
    const sessionId = String(session.id)
    for (const programmed of session.exercises) {
      const exercise = catalogById.get(programmed.exerciseId)
      const sets = Math.max(0, Number(programmed.sets) || 0)
      if (!exercise || sets === 0) continue
      totalProgrammedSets += sets
      const touched = new Set<string>()
      for (const muscle of exercise.muscles ?? []) {
        const key = muscle.toLowerCase()
        accumulator[key] ??= { directSets: 0, secondarySets: 0, sessions: new Set() }
        accumulator[key].directSets += sets
        touched.add(key)
      }
      for (const muscle of exercise.muscles_secondary ?? []) {
        const key = muscle.toLowerCase()
        accumulator[key] ??= { directSets: 0, secondarySets: 0, sessions: new Set() }
        accumulator[key].secondarySets += sets
        touched.add(key)
      }
      for (const muscle of touched) accumulator[muscle].sessions.add(sessionId)
    }
  }

  return {
    byMuscle: Object.fromEntries(
      Object.entries(accumulator).map(([muscle, value]) => [muscle, {
        directSets: value.directSets,
        secondarySets: value.secondarySets,
        effectiveSets: value.directSets + value.secondarySets * 0.5,
        frequency: value.sessions.size,
      }]),
    ),
    totalProgrammedSets,
  }
}

function availableForEquipment(exercise: CompositionCatalogExercise, available: string[]): boolean {
  if (available.includes('full_gym')) return true
  const equipment = normalizeEquipment(exercise.equipment)
  if (!equipment) return false
  return available.includes(equipment)
}

function matchesNeed(exercise: CompositionCatalogExercise, need: CompositionNeed): boolean {
  const metadata = inferExerciseCompositionMetadata(exercise)
  if (need.kind === 'movement_gap') return metadata.movementPatterns.includes(need.key)
  const muscles = [...(exercise.muscles ?? []), ...(exercise.muscles_secondary ?? [])]
  return muscles.some((muscle) => muscle.toLowerCase() === need.key)
}

function movementNeed(pattern: string): CompositionNeed {
  const label = MOVEMENT_LABELS[pattern] ?? pattern.replaceAll('_', ' ')
  return {
    kind: 'movement_gap',
    key: pattern,
    label,
    explanation: pattern === 'knee_dominant'
      ? 'This session does not yet include a knee-dominant lower-body exercise.'
      : `This session does not yet include a ${label.toLowerCase()} exercise.`,
  }
}

function muscleNeed(muscle: string, frequency: number, sets: number): CompositionNeed {
  return {
    kind: 'weekly_muscle_gap',
    key: muscle,
    label: `${muscle.replace(/\b\w/g, (letter) => letter.toUpperCase())} weekly exposure`,
    explanation: `${muscle} currently has ${sets} effective weekly sets across ${frequency} session${frequency === 1 ? '' : 's'}; the selected goal calls for more weekly sets or frequency.`,
  }
}

export function suggestNextExercises({
  questionnaire,
  blueprint,
  catalog,
  selectedExercises,
  weeklySessions,
  minutesUsed,
}: {
  questionnaire: CompositionQuestionnaire
  blueprint: TrainingBlueprint
  catalog: CompositionCatalogExercise[]
  selectedExercises: ProgrammedExercise[]
  weeklySessions: WeeklySession[]
  minutesUsed: number
}): ExerciseSuggestionResult {
  if (minutesUsed >= Math.max(0, questionnaire.minutesPerSession - 2)) {
    return { status: 'time_limit', need: null, suggestions: [], stopReason: 'session_time_exhausted' }
  }

  const catalogById = new Map(catalog.map((exercise) => [exercise.id, exercise]))
  const selectedIds = new Set(selectedExercises.map((exercise) => exercise.exerciseId))
  const selectedFamilies = new Set(
    selectedExercises
      .map((exercise) => catalogById.get(exercise.exerciseId))
      .filter((exercise): exercise is CompositionCatalogExercise => Boolean(exercise))
      .map((exercise) => inferExerciseCompositionMetadata(exercise).variationFamily),
  )
  const coveredPatterns = new Set(
    selectedExercises.flatMap((exercise) => {
      const catalogExercise = catalogById.get(exercise.exerciseId)
      return catalogExercise ? inferExerciseCompositionMetadata(catalogExercise).movementPatterns : []
    }),
  )
  const excludedIds = new Set(questionnaire.excludedExerciseIds)
  const excludedPatterns = new Set(questionnaire.excludedMovementPatterns)

  const eligible = catalog.filter((exercise) => {
    const metadata = inferExerciseCompositionMetadata(exercise)
    if (selectedIds.has(exercise.id) || excludedIds.has(exercise.id)) return false
    if (selectedFamilies.has(metadata.variationFamily)) return false
    if (metadata.movementPatterns.some((pattern) => excludedPatterns.has(pattern))) return false
    if (!availableForEquipment(exercise, questionnaire.equipment)) return false
    if (questionnaire.experience === 'beginner' && metadata.skillLevel === 'advanced') return false
    return true
  })

  const needs: CompositionNeed[] = blueprint.requiredMovementPatterns
    .filter((pattern) => !coveredPatterns.has(pattern) && !excludedPatterns.has(pattern))
    .map(movementNeed)

  if (needs.length === 0 && blueprint.weeklyMuscleSetTarget.min > 0) {
    const analysis = analyzeWeeklyComposition({ catalog, sessions: weeklySessions })
    for (const muscle of MUSCLE_PRIORITY) {
      const exposure = analysis.byMuscle[muscle] ?? { effectiveSets: 0, frequency: 0 }
      if (
        exposure.effectiveSets < blueprint.weeklyMuscleSetTarget.min ||
        exposure.frequency < blueprint.minimumMuscleFrequency
      ) {
        needs.push(muscleNeed(muscle, exposure.frequency, exposure.effectiveSets))
        break
      }
    }
  }

  for (const need of needs) {
    const suggestions = eligible
      .filter((exercise) => matchesNeed(exercise, need))
      .map((exercise): ExerciseSuggestion => {
        const metadata = inferExerciseCompositionMetadata(exercise)
        const exactExperience = metadata.skillLevel === questionnaire.experience
        const reasonCodes = [need.kind === 'movement_gap' ? 'fills_movement_gap' : 'improves_weekly_exposure']
        if (metadata.compound) reasonCodes.push('compound_option')
        if (exactExperience || metadata.skillLevel === 'beginner') reasonCodes.push('experience_match')
        const score = 100 + (metadata.compound ? 10 : 0) + (exactExperience ? 4 : 0) - metadata.movementPatterns.length
        return {
          exerciseId: exercise.id,
          score,
          reasonCodes,
          explanation: `${exercise.name} ${need.kind === 'movement_gap' ? `fills the ${need.label.toLowerCase()} gap` : `adds useful ${need.key} exposure`} with equipment you selected.`,
          prescription: blueprint.prescription,
          movementPatterns: metadata.movementPatterns,
        }
      })
      .sort((a, b) => b.score - a.score || a.exerciseId - b.exerciseId)
      .slice(0, 3)

    if (suggestions.length > 0) return { status: 'suggestions', need, suggestions }
  }

  if (needs.length > 0) {
    return { status: 'complete', need: null, suggestions: [], stopReason: 'no_matching_exercises' }
  }

  return { status: 'complete', need: null, suggestions: [], stopReason: 'composition_complete' }
}
