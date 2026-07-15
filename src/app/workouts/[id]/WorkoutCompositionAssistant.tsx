'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { SlimExercise } from '@/app/workout/[id]/ExercisePickerSheet'
import Modal from '@/components/Modal'
import {
  createTrainingBlueprint,
  inferExerciseCompositionMetadata,
  normalizeCompositionQuestionnaire,
  suggestNextExercises,
  type CompositionGoal,
  type CompositionExperience,
  type MovementPattern,
  type ExerciseSuggestion,
} from '@/lib/workoutComposition'
import type { TemplateExercise } from './TemplateEditor'

type PrescribedAdd = {
  sets: number
  reps: number
  restSeconds: number
}

const GOALS: Array<{ value: CompositionGoal; label: string; help: string }> = [
  { value: 'general_health', label: 'General health', help: 'Build a balanced, repeatable routine.' },
  { value: 'hypertrophy', label: 'Build muscle', help: 'Accumulate useful weekly training volume.' },
  { value: 'strength', label: 'Get stronger', help: 'Practice key movements with heavier work.' },
  { value: 'return_to_training', label: 'Return to training', help: 'Start simple and build consistency.' },
]

const EXPERIENCES: Array<{ value: CompositionExperience; label: string }> = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Some experience' },
  { value: 'advanced', label: 'Experienced' },
]

const EQUIPMENT = [
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'dumbbell', label: 'Dumbbells' },
  { value: 'bands', label: 'Bands' },
  { value: 'full_gym', label: 'Full gym' },
]

const GOAL_LABELS: Record<CompositionGoal, string> = {
  general_health: 'General health',
  hypertrophy: 'Build muscle',
  strength: 'Get stronger',
  return_to_training: 'Return to training',
  muscular_endurance: 'Muscular endurance',
}

function equipmentLabel(exercise: SlimExercise): string {
  const value = exercise.equipment?.trim().toLowerCase()
  if (!value || ['body only', 'bodyweight', 'none', 'no equipment'].includes(value)) return 'Bodyweight'
  return exercise.equipment!.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function repTarget(suggestion: ExerciseSuggestion): number {
  const { min, max } = suggestion.prescription.repRange
  return Math.round((min + max) / 2)
}

function splitLabel(split: 'full_body' | 'upper_lower') {
  return split === 'full_body' ? 'Full-body' : 'Upper/lower'
}

export default function WorkoutCompositionAssistant({
  exercises,
  items,
  onAddExercise,
  onRemoveExercise,
  onChooseManually,
  onClose,
}: {
  exercises: SlimExercise[]
  items: TemplateExercise[]
  onAddExercise: (exercise: SlimExercise, prescription: PrescribedAdd) => string
  onRemoveExercise: (localId: string) => void
  onChooseManually: () => void
  onClose: () => void
}) {
  const [phase, setPhase] = useState<'questionnaire' | 'suggestions'>('questionnaire')
  const [primaryGoal, setPrimaryGoal] = useState<CompositionGoal>('general_health')
  const [daysPerWeek, setDaysPerWeek] = useState(2)
  const [minutesPerSession, setMinutesPerSession] = useState(45)
  const [experience, setExperience] = useState<CompositionExperience>('beginner')
  const [sessionFocus, setSessionFocus] = useState<'upper' | 'lower'>('upper')
  const [equipment, setEquipment] = useState<string[]>([])
  const [rejectedExerciseIds, setRejectedExerciseIds] = useState<number[]>([])
  const [skippedMovementPatterns, setSkippedMovementPatterns] = useState<string[]>([])
  const [round, setRound] = useState(1)
  const [announcement, setAnnouncement] = useState('')
  const [lastAdded, setLastAdded] = useState<{ localId: string; exerciseName: string } | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const roundHeadingRef = useRef<HTMLHeadingElement>(null)
  const previousRoundRef = useRef(round)

  const questionnaire = useMemo(
    () => normalizeCompositionQuestionnaire({
      primaryGoal,
      daysPerWeek,
      minutesPerSession,
      experience,
      equipment: equipment.length > 0 ? equipment : ['bodyweight'],
      excludedExerciseIds: rejectedExerciseIds,
      excludedMovementPatterns: skippedMovementPatterns,
    }),
    [daysPerWeek, equipment, experience, minutesPerSession, primaryGoal, rejectedExerciseIds, skippedMovementPatterns],
  )
  const blueprint = useMemo(() => createTrainingBlueprint(questionnaire), [questionnaire])
  const sessionBlueprint = useMemo(() => ({
    ...blueprint,
    requiredMovementPatterns: blueprint.split === 'upper_lower'
      ? sessionFocus === 'upper'
        ? ['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'trunk'] as MovementPattern[]
        : ['knee_dominant', 'hip_hinge', 'unilateral_lower', 'trunk'] as MovementPattern[]
      : blueprint.requiredMovementPatterns,
    // The editor currently owns one template, not the user's complete week.
    // Keep the tested weekly analysis in the engine for future multi-session
    // input, but do not manufacture a weekly adequacy claim from one draft.
    weeklyMuscleSetTarget: { ...blueprint.weeklyMuscleSetTarget, min: 0 },
  }), [blueprint, sessionFocus])
  const selectedExercises = useMemo(
    () => items.map((item) => ({
      exerciseId: item.exerciseId,
      sets: item.setDetails?.length ?? item.sets,
    })),
    [items],
  )
  const result = useMemo(
    () => suggestNextExercises({
      questionnaire,
      blueprint: sessionBlueprint,
      catalog: exercises,
      selectedExercises,
      weeklySessions: [],
      minutesUsed: selectedExercises.reduce((total, item) => total + Math.max(5, item.sets * 2), 0),
    }),
    [exercises, questionnaire, selectedExercises, sessionBlueprint],
  )
  const exercisesById = useMemo(
    () => new Map(exercises.map((exercise) => [exercise.id, exercise])),
    [exercises],
  )

  useEffect(() => {
    if (phase !== 'suggestions') return
    if (round === 1) {
      contentRef.current?.scrollTo({ top: 0 })
    } else if (round !== previousRoundRef.current) {
      roundHeadingRef.current?.focus({ preventScroll: false })
    }
    previousRoundRef.current = round
  }, [phase, round])

  function toggleEquipment(value: string) {
    setEquipment((current) => {
      if (value === 'full_gym') return current.includes(value) ? [] : ['full_gym']
      const withoutFullGym = current.filter((entry) => entry !== 'full_gym')
      return withoutFullGym.includes(value)
        ? withoutFullGym.filter((entry) => entry !== value)
        : [...withoutFullGym, value]
    })
  }

  function startSuggestions(event: React.FormEvent) {
    event.preventDefault()
    setRound(1)
    setPhase('suggestions')
    setAnnouncement('Training direction ready. Review the first recommendation round.')
  }

  function addSuggestion(suggestion: ExerciseSuggestion) {
    const exercise = exercisesById.get(suggestion.exerciseId)
    if (!exercise) return
    const reps = repTarget(suggestion)
    const localId = onAddExercise(exercise, {
      sets: suggestion.prescription.sets,
      reps,
      restSeconds: suggestion.prescription.restSeconds.min,
    })
    setLastAdded({ localId, exerciseName: exercise.name })
    setRound((current) => current + 1)
    setAnnouncement(`Added ${exercise.name}: ${suggestion.prescription.sets} sets of ${suggestion.prescription.repRange.min} to ${suggestion.prescription.repRange.max} reps.`)
  }

  function rejectSuggestion(suggestion: ExerciseSuggestion) {
    const exercise = exercisesById.get(suggestion.exerciseId)
    setRejectedExerciseIds((current) => [...new Set([...current, suggestion.exerciseId])])
    setRound((current) => current + 1)
    setAnnouncement(exercise ? `${exercise.name} will not be suggested again in this guide.` : 'Suggestion removed.')
  }

  function skipCurrentGap() {
    if (!result.need || result.need.kind !== 'movement_gap') return
    setSkippedMovementPatterns((current) => [...new Set([...current, result.need!.key])])
    setRound((current) => current + 1)
    setAnnouncement(`${result.need.label} skipped for this guide.`)
  }

  function undoLastAdd() {
    if (!lastAdded) return
    onRemoveExercise(lastAdded.localId)
    setAnnouncement(`Removed ${lastAdded.exerciseName} from this draft.`)
    setLastAdded(null)
    setRound((current) => Math.max(1, current - 1))
  }

  return (
    <Modal
      title="Workout composition guide"
      onClose={onClose}
      backdropClassName="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 sm:items-center sm:px-4 sm:py-6"
      panelClassName="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl outline-none dark:bg-zinc-950 sm:max-h-[92vh] sm:max-w-3xl sm:rounded-[28px]"
    >
      <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:px-7">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">Workout guide</p>
          <h2 className="mt-1 text-xl font-black text-zinc-950 dark:text-white">Build a workout that fits</h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">Suggestions update your unsaved draft. You decide when to save or start it.</p>
        </div>
        <button type="button" aria-label="Close guide" onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-full text-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white">×</button>
      </div>

      <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
        {phase === 'questionnaire' ? (
          <form onSubmit={startSuggestions} className="space-y-7">
            <fieldset>
              <legend className="text-sm font-black text-zinc-950 dark:text-white">What matters most right now?</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {GOALS.map((goal) => (
                  <label key={goal.value} className={`flex min-h-20 cursor-pointer gap-3 rounded-2xl border p-4 transition ${primaryGoal === goal.value ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20' : 'border-zinc-200 dark:border-zinc-800'}`}>
                    <input type="radio" name="primary-goal" value={goal.value} checked={primaryGoal === goal.value} onChange={() => setPrimaryGoal(goal.value)} className="mt-1 accent-orange-500" />
                    <span><span className="block text-sm font-bold text-zinc-900 dark:text-white">{goal.label}</span><span className="mt-1 block text-xs leading-5 text-zinc-500">{goal.help}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold text-zinc-900 dark:text-white">Training days per week
                <select aria-label="Training days per week" value={daysPerWeek} onChange={(event) => setDaysPerWeek(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                  {[1, 2, 3, 4, 5, 6].map((days) => <option key={days} value={days}>{days} {days === 1 ? 'day' : 'days'}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-zinc-900 dark:text-white">Minutes per session
                <select aria-label="Minutes per session" value={minutesPerSession} onChange={(event) => setMinutesPerSession(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                  <option value="25">20–30 minutes</option>
                  <option value="45">40–55 minutes</option>
                  <option value="65">60–75 minutes</option>
                  <option value="90">Flexible</option>
                </select>
              </label>
            </div>

            {blueprint.split === 'upper_lower' && (
              <fieldset>
                <legend className="text-sm font-black text-zinc-950 dark:text-white">This session focus</legend>
                <p className="mt-1 text-xs leading-5 text-zinc-500">Your availability suits an upper/lower week. Choose the session you are building now.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(['upper', 'lower'] as const).map((focus) => (
                    <label key={focus} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-bold ${sessionFocus === focus ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20' : 'border-zinc-200 dark:border-zinc-800'}`}>
                      <input type="radio" name="session-focus" value={focus} checked={sessionFocus === focus} onChange={() => setSessionFocus(focus)} className="accent-orange-500" />
                      {focus === 'upper' ? 'Upper body' : 'Lower body'}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <fieldset>
              <legend className="text-sm font-black text-zinc-950 dark:text-white">Training experience</legend>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {EXPERIENCES.map((option) => (
                  <label key={option.value} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-bold ${experience === option.value ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20' : 'border-zinc-200 dark:border-zinc-800'}`}>
                    <input type="radio" name="experience" value={option.value} checked={experience === option.value} onChange={() => setExperience(option.value)} className="accent-orange-500" />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-black text-zinc-950 dark:text-white">Equipment available today</legend>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {EQUIPMENT.map((option) => (
                  <label key={option.value} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-bold ${equipment.includes(option.value) ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20' : 'border-zinc-200 dark:border-zinc-800'}`}>
                    <input type="checkbox" checked={equipment.includes(option.value)} onChange={() => toggleEquipment(option.value)} className="accent-orange-500" />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <aside className="rounded-2xl bg-zinc-100 p-4 text-xs leading-5 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              For healthy adults planning general exercise—not injury rehabilitation or medical advice. Stop if an exercise causes pain and seek qualified guidance when needed.
            </aside>
            <button type="submit" className="min-h-12 w-full rounded-xl bg-orange-500 px-5 text-sm font-black uppercase tracking-wide text-white hover:bg-orange-600">Show suggestions</button>
          </form>
        ) : (
          <div className="space-y-5">
            <section aria-label="Your training direction" className="rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900 dark:bg-orange-950/20">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-600">Your training direction</p>
              <h3 className="mt-1 text-lg font-black text-zinc-950 dark:text-white">{GOAL_LABELS[blueprint.primaryGoal]} · {splitLabel(blueprint.split)}</h3>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{blueprint.frequencyPerWeek} days · {blueprint.split === 'upper_lower' ? `${sessionFocus === 'upper' ? 'upper-body' : 'lower-body'} session · ` : ''}about {blueprint.exerciseCount.min}–{blueprint.exerciseCount.max} exercises · {blueprint.minutesPerSession} minutes</p>
              <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400">This guide builds one session. It does not create or schedule your whole week. {blueprint.explanation}</p>
              <p className="mt-2 text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">Weekly target: {blueprint.weeklyMuscleSetTarget.min}–{blueprint.weeklyMuscleSetTarget.max} effective sets per major muscle, usually across at least {blueprint.minimumMuscleFrequency} sessions. This draft alone is not treated as the whole week.</p>
            </section>

            {lastAdded && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">Added {lastAdded.exerciseName} to the unsaved draft.</span>
                <button type="button" onClick={undoLastAdd} className="min-h-11 rounded-lg px-3 font-black text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30">Undo last add</button>
              </div>
            )}

            {result.status === 'suggestions' && result.need ? (
              <>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-500">Round {round}</p>
                  <h3 ref={roundHeadingRef} tabIndex={-1} className="mt-1 text-xl font-black text-zinc-950 outline-none dark:text-white">Next gap: {result.need.label}</h3>
                  <p className="mt-1 text-sm leading-6 text-zinc-500">{result.need.explanation}</p>
                </div>
                <section aria-label={`Suggestions for ${result.need.label}`} className="grid gap-3 sm:grid-cols-3">
                  {result.suggestions.map((suggestion) => {
                    const exercise = exercisesById.get(suggestion.exerciseId)
                    if (!exercise) return null
                    const metadata = inferExerciseCompositionMetadata(exercise)
                    return (
                      <article key={exercise.id} data-recommendation-card className="flex min-w-0 flex-col rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-orange-500">{metadata.movementPatterns[0]?.replaceAll('_', ' ') ?? 'Exercise'}</p>
                          <h3 className="mt-1 text-base font-black text-zinc-950 dark:text-white">{exercise.name}</h3>
                          <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400"><strong>Why this fits:</strong> {suggestion.explanation}</p>
                          <dl className="mt-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                            <div><dt className="inline font-bold">Prescription: </dt><dd className="inline">{suggestion.prescription.sets} sets · {repTarget(suggestion)} reps ({suggestion.prescription.repRange.min}–{suggestion.prescription.repRange.max} range)</dd></div>
                            <div><dt className="inline font-bold">Rest: </dt><dd className="inline">{suggestion.prescription.restSeconds.min}–{suggestion.prescription.restSeconds.max}s</dd></div>
                            <div><dt className="inline font-bold">Equipment: </dt><dd className="inline">{equipmentLabel(exercise)}</dd></div>
                          </dl>
                        </div>
                        <div className="mt-4 flex flex-col gap-2">
                          <button type="button" onClick={() => addSuggestion(suggestion)} className="min-h-11 rounded-xl bg-zinc-950 px-3 text-xs font-black text-white hover:bg-orange-500 dark:bg-white dark:text-zinc-950 dark:hover:bg-orange-500 dark:hover:text-white">Add {exercise.name}</button>
                          <button type="button" onClick={() => rejectSuggestion(suggestion)} className="min-h-11 rounded-xl border border-zinc-200 px-3 text-xs font-bold text-zinc-600 hover:border-orange-300 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-400">Not for me: {exercise.name}</button>
                        </div>
                      </article>
                    )
                  })}
                </section>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={skipCurrentGap} className="min-h-11 rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">Skip this gap</button>
                  <button type="button" onClick={onChooseManually} className="min-h-11 rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">Choose manually</button>
                </div>
              </>
            ) : (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/20">
                <h3 className="text-lg font-black text-emerald-950 dark:text-emerald-100">{result.stopReason === 'no_matching_exercises' ? 'No suitable catalog match' : 'Good base for this session'}</h3>
                <p className="mt-1 text-sm leading-6 text-emerald-800 dark:text-emerald-300">{result.status === 'time_limit' ? 'Your target session time is effectively used. Review the draft before adding more.' : result.stopReason === 'no_matching_exercises' ? 'The remaining gap has no safe match for the equipment, experience, and choices you set. Change your answers or choose manually.' : 'The main movement needs are covered with the equipment you selected.'}</p>
              </section>
            )}

            <p className="text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">Coverage uses catalog movement tags when available and a deterministic name-and-muscle classification for older exercises. Treat it as planning support, not an anatomical or medical assessment.</p>

            {skippedMovementPatterns.length > 0 && (
              <button type="button" onClick={() => { setSkippedMovementPatterns([]); setRound((current) => current + 1) }} className="min-h-11 rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">Review skipped gaps</button>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:flex-row sm:justify-between">
              <button type="button" onClick={() => setPhase('questionnaire')} className="min-h-11 rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">Back to questionnaire</button>
              <button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-orange-500 px-5 text-sm font-black text-white hover:bg-orange-600">Finish recommendations</button>
            </div>
          </div>
        )}
      </div>
      <p aria-live="polite" className="sr-only">{announcement}</p>
    </Modal>
  )
}
