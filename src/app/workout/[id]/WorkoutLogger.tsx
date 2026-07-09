'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { saveWorkoutProgress, completeWorkout, SetPayload } from '@/app/actions/workouts'
import { fetchExerciseDetails, fetchLastExercisePerformance, fetchBestExercisePerformance, fetchBestExercisePerformance60Days } from '@/app/actions/exercises'
import { fetchUserTemplates } from '@/app/actions/templates'
import { fetchExerciseNotes, saveExerciseNote } from '@/app/actions/notes'
import { LastExercisePerformance, RoutineWithExercises } from '@/lib/dal'
import ExercisePickerSheet, { SlimExercise } from './ExercisePickerSheet'
import ExerciseInfoModal from './ExerciseInfoModal'
import LastPerfModal from './LastPerfModal'
import DruhTimer from './DruhTimer'
import RestTimer from './RestTimer'
import ExerciseGuide, { GuideSet } from './ExerciseGuide'
import Stepper from './Stepper'
import { useWorkoutClipboard } from '@/lib/WorkoutClipboardContext'
import { TempoConfig, repDuration, formatTempo, parseTempo } from '@/lib/tempo'
import { startsRestOnComplete } from '@/lib/restTimer'
import { deriveInitialSets } from '@/lib/deriveInitialSets'
import { expandTemplate } from '@/lib/expandTemplate'
import {
  LocalSet,
  addSet as addSetOp,
  deleteSet as deleteSetOp,
  applyEdit,
  reorderExercise,
  recordRestForSet,
} from '@/lib/setListOps'
import { localDateStr } from '@/lib/localDate'

// ─── Types ───────────────────────────────────────────────────────────────────

type ExerciseDetails = {
  id: number
  name: string
  category: string | null
  equipment: string | null
  muscles: string[] | null
  muscles_secondary: string[] | null
  images: string[] | null
  instructions: string[] | null
}

type Workout = {
  id: number
  date: string
  status: string
  template_id?: string | null
  sets: {
    id: number
    exercise_id: number
    weight: number | null
    reps: number | null
    duration_minutes: number | null
    distance: number | null
    rest_seconds?: number | null
    exercises: { name: string; category: string | null } | null
  }[]
}

// Persisted UI prefs (tempo/rest) — SSR-safe localStorage helpers.
function readStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw != null ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeStored(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota/availability */
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkoutLogger({
  workout,
  exercises,
  initialTemplate,
}: {
  workout: Workout
  exercises: SlimExercise[]
  initialTemplate?: RoutineWithExercises | null
}) {
  const [isPending, startTransition] = useTransition()
  const { clipboard, copy: copyToClipboard } = useWorkoutClipboard()
  const [copied, setCopied] = useState(false)
  const [showPasteConfirm, setShowPasteConfirm] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  // All sets live in client state only — committed on Finish. §2 invariants
  // (completed never falls back to template) are enforced by deriveInitialSets.
  const [localSets, setLocalSets] = useState<LocalSet[]>(() => deriveInitialSets(workout, initialTemplate ?? null))

  // Add-set form
  const [selectedExercise, setSelectedExercise] = useState<SlimExercise | null>(null)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [duration, setDuration] = useState('')
  const [distance, setDistance] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  // Inline set editing
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editWeight, setEditWeight] = useState('')
  const [editReps, setEditReps] = useState('')
  const [editDuration, setEditDuration] = useState('')
  const [editDistance, setEditDistance] = useState('')

  // Exercise picker filter state
  const [pickerActiveMuscles, setPickerActiveMuscles] = useState<string[]>([])
  const [pickerActiveCategories, setPickerActiveCategories] = useState<string[]>([])

  // Guided set (DRUH tempo timer) + rest timer — persisted so they don't reset.
  const [tempo, setTempo] = useState<TempoConfig>(() => readStored('wt.tempo', { down: 3, rest: 1, up: 2, hold: 1 }))
  const [restMode, setRestMode] = useState<'fixed' | 'variable'>(() => readStored<'fixed' | 'variable'>('wt.restMode', 'fixed'))
  const [restTarget, setRestTarget] = useState(() => readStored('wt.restTarget', 90))

  // PT-prescribed tempo per exercise, from the template this workout came from.
  const ptTempo = useMemo(() => {
    const map: Record<number, TempoConfig> = {}
    for (const ex of initialTemplate?.routine_exercises ?? []) {
      const t = ex.tempo ? parseTempo(ex.tempo) : null
      if (t) map[ex.exercise_id] = t
    }
    return map
  }, [initialTemplate])

  useEffect(() => { writeStored('wt.tempo', tempo) }, [tempo])
  useEffect(() => { writeStored('wt.restMode', restMode) }, [restMode])
  useEffect(() => { writeStored('wt.restTarget', restTarget) }, [restTarget])
  const [guidedSetup, setGuidedSetup] = useState<{
    exercise: SlimExercise
    goalReps: string
    weight: string
    targetLocalId?: string // adjust + run guided for an existing (scheduled) set
  } | null>(null)
  const [runningDruh, setRunningDruh] = useState<{
    exercise: SlimExercise
    goalReps: number
    weight: number | null
    targetLocalId?: string // when set, fill this existing (pending) set instead of appending
  } | null>(null)
  // Inline "last session" per exercise, for at-a-glance comparison
  const [lastPerf, setLastPerf] = useState<Record<number, LastExercisePerformance | null>>({})
  // Per-exercise personal notes
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [editingNote, setEditingNote] = useState<{ exerciseId: number; name: string; text: string } | null>(null)
  // localId of the set the active rest timer will attach its elapsed time to
  const [restForSet, setRestForSet] = useState<string | null>(null)
  // Bumped every time rest (re)starts so the timer always resets from 0 —
  // never continues a previous rest, even for the same set.
  const [restNonce, setRestNonce] = useState(0)
  function startRestFor(localId: string) {
    setRestForSet(localId)
    setRestNonce((n) => n + 1)
  }
  // exerciseId currently being guided as a whole (full-screen set→rest→set…)
  const [guidingExerciseId, setGuidingExerciseId] = useState<number | null>(null)
  // Setup screen for the whole-exercise guide (edit per-set reps/weight + tempo)
  const [guideSetup, setGuideSetup] = useState<{
    exerciseId: number
    exerciseName: string
    rows: { localId: string; reps: number; weight: number }[]
  } | null>(null)

  // Sheets & modals
  const [showPicker, setShowPicker] = useState(false)
  const [showImportPicker, setShowImportPicker] = useState(false)
  const [showAbandonPrompt, setShowAbandonPrompt] = useState(false)
  const [showDiscardEditsPrompt, setShowDiscardEditsPrompt] = useState(false)
  const [showSaveWarning, setShowSaveWarning] = useState(false)
  const [savedOnce, setSavedOnce] = useState(false)
  const [infoExercise, setInfoExercise] = useState<ExerciseDetails | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  type PerfMode = 'last' | 'best' | 'best60'
  const PERF_TITLE: Record<PerfMode, string> = { last: 'Last session', best: 'Best session', best60: 'Best · 60 days' }
  const [perfModal, setPerfModal] = useState<{ id: number; name: string; mode: PerfMode } | null>(null)
  const [perfData, setPerfData] = useState<LastExercisePerformance | null>(null)
  const [perfLoading, setPerfLoading] = useState(false)

  // Template import
  const [templates, setTemplates] = useState<RoutineWithExercises[] | null>(null)
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Warn on browser tab close / refresh — only for active workouts with unsaved sets
  useEffect(() => {
    if (workout.status === 'completed') return
    const handler = (e: BeforeUnloadEvent) => {
      if (localSets.length > 0) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [workout.status, localSets.length])

  // ─── Grouped view ──────────────────────────────────────────────────────────

  const { grouped, exerciseOrder } = localSets.reduce<{
    grouped: Record<number, { name: string; sets: LocalSet[] }>
    exerciseOrder: number[]
  }>(
    (acc, s) => {
      if (!acc.grouped[s.exerciseId]) {
        acc.grouped[s.exerciseId] = { name: s.exerciseName, sets: [] }
        acc.exerciseOrder.push(s.exerciseId)
      }
      acc.grouped[s.exerciseId].sets.push(s)
      return acc
    },
    { grouped: {}, exerciseOrder: [] },
  )

  // Fetch last-session performance for each exercise present, once per exercise.
  const exerciseKey = exerciseOrder.join(',')
  useEffect(() => {
    exerciseOrder.forEach((id) => {
      if (id in lastPerf) return
      setLastPerf((prev) => ({ ...prev, [id]: null })) // mark in-flight to avoid dupes
      fetchLastExercisePerformance(id).then((data) => setLastPerf((prev) => ({ ...prev, [id]: data })))
    })
    const missingNotes = exerciseOrder.filter((id) => !(id in notes))
    if (missingNotes.length > 0) {
      fetchExerciseNotes(missingNotes).then((map) =>
        setNotes((prev) => {
          const next = { ...prev }
          for (const id of missingNotes) next[id] = map[id] ?? ''
          return next
        }),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseKey])

  // Keyboard-open detection: while a field is focused the on-screen keyboard
  // shrinks the viewport and shoves a sticky bar around — so drop the sticky
  // rest bar out of `sticky` positioning until focus leaves.
  const [fieldFocused, setFieldFocused] = useState(false)
  useEffect(() => {
    const isField = (el: EventTarget | null) => {
      const t = el as HTMLElement | null
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')
    }
    const onIn = (e: FocusEvent) => { if (isField(e.target)) setFieldFocused(true) }
    const onOut = () => { setTimeout(() => { if (!isField(document.activeElement)) setFieldFocused(false) }, 0) }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut) }
  }, [])

  function handleSaveNote() {
    if (!editingNote) return
    const { exerciseId, text } = editingNote
    setNotes((prev) => ({ ...prev, [exerciseId]: text.trim() }))
    setEditingNote(null)
    startTransition(async () => {
      await saveExerciseNote(exerciseId, text)
    })
  }

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleSelectExercise(ex: SlimExercise) {
    const previous = [...localSets].reverse().find((s) => s.exerciseId === ex.id)
    setSelectedExercise(ex)
    setShowPicker(false)
    if (ex.category === 'cardio') {
      setDuration(previous?.duration_minutes != null ? String(previous.duration_minutes) : '')
      setDistance(previous?.distance != null ? String(previous.distance) : '')
      setWeight('')
      setReps('')
    } else {
      setWeight(previous?.weight != null ? String(previous.weight) : '')
      setReps(previous?.reps != null ? String(previous.reps) : '')
      setDuration('')
      setDistance('')
    }
    setAddError(null)
  }

  function handleAddSet() {
    if (!selectedExercise) return
    const isCardio = selectedExercise.category === 'cardio'
    if (isCardio) {
      if (!duration) { setAddError('Enter duration'); return }
    } else {
      if (!weight && !reps) { setAddError('Enter weight or reps'); return }
    }
    const newSet: LocalSet = {
      localId: crypto.randomUUID(),
      exerciseId: selectedExercise.id,
      exerciseName: selectedExercise.name,
      exerciseCategory: selectedExercise.category,
      weight: !isCardio && weight ? Number(weight) : null,
      reps: !isCardio && reps ? Number(reps) : null,
      duration_minutes: isCardio && duration ? Number(duration) : null,
      distance: isCardio && distance ? Number(distance) : null,
      rest_seconds: null,
      done: true,
    }
    const nextSets = addSetOp(localSets, newSet)
    setLocalSets(nextSets)
    // Completing a set (plain add) auto-starts rest for it.
    if (startsRestOnComplete(selectedExercise.category)) startRestFor(newSet.localId)
    setWeight('')
    setReps('')
    setDuration('')
    setDistance('')
    setAddError(null)
    setSavedOnce(true)
    persist(nextSets)
  }

  function persist(sets: LocalSet[]) {
    startTransition(async () => {
      await saveWorkoutProgress(workout.id, sets.map(toPayload))
    })
  }

  function handleDeleteSet(localId: string) {
    setLocalSets((prev) => deleteSetOp(prev, localId))
  }

  // Tapping a set's ✓ commits it (done) and auto-starts rest for that set.
  function toggleDone(localId: string) {
    let becameDone = false
    let category: string | null = null
    const nextSets = localSets.map((s) => {
      if (s.localId !== localId) return s
      becameDone = !s.done
      category = s.exerciseCategory
      return { ...s, done: !s.done }
    })
    setLocalSets(nextSets)
    setSavedOnce(true)
    persist(nextSets)
    if (becameDone && startsRestOnComplete(category)) startRestFor(localId)
  }

  // ── Guided set (DRUH) ──────────────────────────────────────────────────────

  function openGuidedSetup() {
    if (!selectedExercise) return
    applyPtTempo(selectedExercise.id)
    setGuidedSetup({ exercise: selectedExercise, goalReps: reps || '8', weight })
  }

  function startGuided() {
    if (!guidedSetup) return
    // A zero-length tempo would never advance a rep — refuse to start.
    if (repDuration(tempo) <= 0) return
    const goal = Math.max(1, Number(guidedSetup.goalReps) || 8)
    setRunningDruh({
      exercise: guidedSetup.exercise,
      goalReps: goal,
      weight: guidedSetup.weight ? Number(guidedSetup.weight) : null,
      targetLocalId: guidedSetup.targetLocalId,
    })
    setGuidedSetup(null)
  }

  // If the PT prescribed a tempo for this exercise, pre-fill the timer with it.
  function applyPtTempo(exerciseId: number) {
    if (ptTempo[exerciseId]) setTempo(ptTempo[exerciseId])
  }

  // Open the adjustable guided setup (tempo/reps/weight) for an existing set.
  function openGuidedSetupForSet(s: LocalSet) {
    const ex = exercises.find((e) => e.id === s.exerciseId)
    if (!ex) return
    applyPtTempo(s.exerciseId)
    setGuidedSetup({
      exercise: ex,
      goalReps: s.reps != null ? String(s.reps) : '8',
      weight: s.weight != null ? String(s.weight) : '',
      targetLocalId: s.localId,
    })
  }

  // From the inline set editor: persist the currently-typed weight/reps, then
  // open guided setup seeded with those values (same interface as elsewhere).
  // Complete a set from within the weight-rep editor: persist the typed values,
  // mark it done, start rest, and keep the set visible (just close the editor).
  function completeFromEdit(s: LocalSet) {
    const isCardio = s.exerciseCategory === 'cardio'
    const nextSets = applyEdit(localSets, s.localId, {
      weight: !isCardio && editWeight ? Number(editWeight) : s.weight,
      reps: !isCardio && editReps ? Number(editReps) : s.reps,
      duration_minutes: isCardio && editDuration ? Number(editDuration) : s.duration_minutes,
      distance: isCardio && editDistance ? Number(editDistance) : s.distance,
      done: true,
    })
    setLocalSets(nextSets)
    setSavedOnce(true)
    setEditingId(null)
    persist(nextSets)
    if (startsRestOnComplete(s.exerciseCategory)) startRestFor(s.localId)
  }

  function guidedFromEdit(s: LocalSet) {
    saveEditSet(s.localId)
    const ex = exercises.find((e) => e.id === s.exerciseId)
    if (!ex) return
    applyPtTempo(s.exerciseId)
    setGuidedSetup({
      exercise: ex,
      goalReps: editReps || (s.reps != null ? String(s.reps) : '8'),
      weight: editWeight || (s.weight != null ? String(s.weight) : ''),
      targetLocalId: s.localId,
    })
  }

  // Called when the DRUH timer stops (goal reached or stopped early)
  function handleGuidedStop(completedReps: number) {
    if (!runningDruh) return
    const targetId = runningDruh.targetLocalId
    const goalWeight = runningDruh.weight

    // Filling an existing scheduled set: record actual reps, mark done, rest.
    if (targetId) {
      setRunningDruh(null)
      if (completedReps <= 0) return // did nothing → leave the set pending
      const nextSets = localSets.map((s) =>
        s.localId === targetId ? { ...s, reps: completedReps, weight: goalWeight, done: true } : s,
      )
      setLocalSets(nextSets)
      setSavedOnce(true)
      persist(nextSets)
      startRestFor(targetId)
      return
    }

    // Stopped before completing a single rep — log nothing.
    if (completedReps <= 0) {
      setRunningDruh(null)
      setSelectedExercise(null)
      return
    }
    const newSet: LocalSet = {
      localId: crypto.randomUUID(),
      exerciseId: runningDruh.exercise.id,
      exerciseName: runningDruh.exercise.name,
      exerciseCategory: runningDruh.exercise.category,
      weight: runningDruh.weight,
      reps: completedReps,
      duration_minutes: null,
      distance: null,
      rest_seconds: null,
      done: true,
    }
    const nextSets = [...localSets, newSet]
    setLocalSets(nextSets)
    setSavedOnce(true)
    setRunningDruh(null)
    setSelectedExercise(null)
    persist(nextSets)
    // Roll straight into rest for this set
    startRestFor(newSet.localId)
  }

  // ── Guide whole exercise ────────────────────────────────────────────────────

  function guideSetsFor(exerciseId: number): GuideSet[] {
    return localSets
      .filter((s) => s.exerciseId === exerciseId)
      .map((s) => ({ localId: s.localId, goalReps: Math.max(1, s.reps ?? 8), weight: s.weight }))
  }

  // Open the whole-exercise guide SETUP (review/edit each set's reps + weight,
  // and the tempo) before starting — mirrors the single-set guided setup.
  function openGuideSetup(exerciseId: number) {
    applyPtTempo(exerciseId)
    const name = grouped[exerciseId]?.name ?? ''
    const rows = localSets
      .filter((s) => s.exerciseId === exerciseId)
      .map((s) => ({ localId: s.localId, reps: s.reps ?? 8, weight: s.weight ?? 0 }))
    if (rows.length === 0) return
    setGuideSetup({ exerciseId, exerciseName: name, rows })
  }

  function updateGuideRow(localId: string, patch: Partial<{ reps: number; weight: number }>) {
    setGuideSetup((g) =>
      g ? { ...g, rows: g.rows.map((r) => (r.localId === localId ? { ...r, ...patch } : r)) } : g,
    )
  }

  function addGuideRow() {
    setGuideSetup((g) => {
      if (!g) return g
      const last = g.rows[g.rows.length - 1] ?? { reps: 8, weight: 0 }
      return { ...g, rows: [...g.rows, { localId: crypto.randomUUID(), reps: last.reps, weight: last.weight }] }
    })
  }

  function removeGuideRow(localId: string) {
    setGuideSetup((g) => {
      if (!g || g.rows.length <= 1) return g // keep at least one set
      return { ...g, rows: g.rows.filter((r) => r.localId !== localId) }
    })
  }

  // Apply the edited per-set targets back onto the sets (adding/removing rows as
  // needed), then launch the guide.
  function startGuideAll() {
    if (!guideSetup) return
    if (repDuration(tempo) <= 0) return
    const exerciseId = guideSetup.exerciseId
    const category = exercises.find((e) => e.id === exerciseId)?.category ?? null

    // Build the exercise's set list from the setup rows (reuse existing sets by
    // localId, create new ones for added rows).
    const rebuilt: LocalSet[] = guideSetup.rows.map((r) => {
      const existing = localSets.find((s) => s.localId === r.localId)
      if (existing) return { ...existing, reps: r.reps, weight: r.weight || null }
      return {
        localId: r.localId,
        exerciseId,
        exerciseName: guideSetup.exerciseName,
        exerciseCategory: category,
        weight: r.weight || null,
        reps: r.reps,
        duration_minutes: null,
        distance: null,
        rest_seconds: null,
        done: false,
      }
    })

    // Splice the rebuilt sets into localSets at the exercise's first position,
    // dropping the exercise's old sets.
    const nextSets: LocalSet[] = []
    let inserted = false
    for (const s of localSets) {
      if (s.exerciseId === exerciseId) {
        if (!inserted) { nextSets.push(...rebuilt); inserted = true }
      } else {
        nextSets.push(s)
      }
    }
    if (!inserted) nextSets.push(...rebuilt)

    setLocalSets(nextSets)
    persist(nextSets)
    setGuidingExerciseId(exerciseId)
    setGuideSetup(null)
  }

  // Called when the whole-exercise guide finishes/exits — write actual reps and
  // mark each guided set done.
  function handleGuideDone(results: { localId: string; reps: number }[]) {
    setGuidingExerciseId(null)
    if (results.length === 0) return
    const byId = new Map(results.map((r) => [r.localId, r.reps]))
    const nextSets = localSets.map((s) =>
      byId.has(s.localId) ? { ...s, reps: byId.get(s.localId)!, done: true } : s,
    )
    setLocalSets(nextSets)
    setSavedOnce(true)
    persist(nextSets)
  }

  // ── Rest timer ─────────────────────────────────────────────────────────────

  function finishRest(elapsedSeconds: number) {
    const target = restForSet
    setRestForSet(null)
    if (!target) return // rest with no set to attach to
    const nextSets = recordRestForSet(localSets, target, elapsedSeconds)
    setLocalSets(nextSets)
    persist(nextSets)
  }

  function startEditSet(s: LocalSet) {
    setEditingId(s.localId)
    setEditWeight(s.weight != null ? String(s.weight) : '')
    setEditReps(s.reps != null ? String(s.reps) : '')
    setEditDuration(s.duration_minutes != null ? String(s.duration_minutes) : '')
    setEditDistance(s.distance != null ? String(s.distance) : '')
  }

  function saveEditSet(localId: string) {
    const target = localSets.find((s) => s.localId === localId)
    const isCardio = target?.exerciseCategory === 'cardio'
    setLocalSets((prev) =>
      applyEdit(prev, localId, {
        weight: !isCardio && editWeight ? Number(editWeight) : null,
        reps: !isCardio && editReps ? Number(editReps) : null,
        duration_minutes: isCardio && editDuration ? Number(editDuration) : null,
        distance: isCardio && editDistance ? Number(editDistance) : null,
      }),
    )
    setEditingId(null)
  }

  async function handleInfoClick(exerciseId: number) {
    setInfoLoading(true)
    const details = await fetchExerciseDetails(exerciseId)
    setInfoLoading(false)
    if (details) setInfoExercise(details as ExerciseDetails)
  }

  async function handlePerfClick(exerciseId: number, exerciseName: string, mode: PerfMode) {
    setPerfModal({ id: exerciseId, name: exerciseName, mode })
    setPerfData(null)
    setPerfLoading(true)
    let data: LastExercisePerformance | null = null
    if (mode === 'last') data = await fetchLastExercisePerformance(exerciseId)
    else if (mode === 'best') data = await fetchBestExercisePerformance(exerciseId)
    else data = await fetchBestExercisePerformance60Days(exerciseId, localDateStr())
    setPerfData(data)
    setPerfLoading(false)
  }

  async function handleOpenImport() {
    setShowImportPicker(true)
    if (templates === null) {
      setLoadingTemplates(true)
      const data = await fetchUserTemplates()
      setTemplates(data)
      setLoadingTemplates(false)
    }
  }

  function handleImportTemplate(template: RoutineWithExercises) {
    setLocalSets(expandTemplate(template.routine_exercises))
    setShowImportPicker(false)
  }

  function handleBack() {
    if (workout.status === 'completed') {
      if (isEditing) { setShowDiscardEditsPrompt(true); return }
      window.location.href = '/dashboard'
      return
    }
    if (localSets.length > 0) {
      setShowAbandonPrompt(true)
    } else {
      window.location.href = '/dashboard'
    }
  }

  function fmtLastPerf(p: LastExercisePerformance | null | undefined): string | null {
    if (!p || !p.sets.length) return null
    return p.sets
      .map((s) => {
        if (s.weight != null && s.reps != null) return `${s.weight}×${s.reps}`
        if (s.weight != null) return `${s.weight}kg`
        if (s.reps != null) return `${s.reps}`
        return '—'
      })
      .join(' · ')
  }

  function toPayload(s: LocalSet): SetPayload {
    return {
      exercise_id: s.exerciseId,
      weight: s.weight,
      reps: s.reps,
      duration_minutes: s.duration_minutes,
      distance: s.distance,
      rest_seconds: s.rest_seconds,
    }
  }

  function buildPayload(): SetPayload[] {
    return localSets.map(toPayload)
  }

  function handleSaveProgress() {
    if (!savedOnce) {
      setShowSaveWarning(true)
      return
    }
    startTransition(async () => {
      await saveWorkoutProgress(workout.id, buildPayload())
    })
  }

  function confirmSaveProgress() {
    setSavedOnce(true)
    setShowSaveWarning(false)
    startTransition(async () => {
      await saveWorkoutProgress(workout.id, buildPayload())
    })
  }

  function handleComplete() {
    startTransition(async () => {
      await completeWorkout(workout.id, buildPayload())
    })
  }

  function handlePasteRequest() {
    if (localSets.length > 0) {
      setShowPasteConfirm(true)
    } else {
      applyPaste()
    }
  }

  function applyPaste() {
    if (!clipboard) return
    const newSets: LocalSet[] = clipboard.entries.flatMap((entry) =>
      Array.from({ length: entry.setCount }, () => ({
        localId: crypto.randomUUID(),
        exerciseId: entry.exerciseId,
        exerciseName: entry.exerciseName,
        exerciseCategory: null,
        weight: entry.weight,
        reps: entry.reps,
        duration_minutes: null,
        distance: null,
        rest_seconds: null,
        done: false,
      })),
    )
    setLocalSets(newSets)
    setShowPasteConfirm(false)
  }

  function handleCopy() {
    const entries = exerciseOrder.map((exerciseId) => ({
      exerciseId,
      exerciseName: grouped[exerciseId].name,
      setCount: grouped[exerciseId].sets.length,
      reps: grouped[exerciseId].sets[0]?.reps ?? null,
      weight: grouped[exerciseId].sets[0]?.weight ?? null,
    }))
    copyToClipboard({ entries, sourceDate: workout.date })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function moveExercise(exerciseId: number, direction: 'up' | 'down') {
    setLocalSets((prev) => reorderExercise(prev, exerciseId, direction))
  }

  // ─── Add-set form (rendered inline or at bottom) ──────────────────────────

  function renderAddSetForm() {
    if (!selectedExercise) return null
    return (
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Adding set</p>
          <button
            onClick={() => setShowPicker(true)}
            className="text-xs font-bold text-orange-500 hover:text-orange-600 transition-colors"
          >
            change
          </button>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <p className="flex-1 min-w-0 truncate text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wide">
            {selectedExercise.name}
          </p>
          <button
            onClick={() => handleInfoClick(selectedExercise.id)}
            title="Exercise info"
            className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none"
          >
            i
          </button>
          <button
            onClick={() => handlePerfClick(selectedExercise.id, selectedExercise.name, 'last')}
            title="Last session"
            className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="6" cy="6" r="5" /><path d="M6 3v3l1.5 1.5" />
            </svg>
          </button>
          <button
            onClick={() => handlePerfClick(selectedExercise.id, selectedExercise.name, 'best')}
            title="Best session"
            className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3.5 1.5h5v3.5a2.5 2.5 0 0 1-5 0V1.5z" /><path d="M6 7v1.5" /><path d="M4 9h4" /><path d="M1.5 2.5h2" /><path d="M8.5 2.5h2" />
            </svg>
          </button>
          <button
            onClick={() => handlePerfClick(selectedExercise.id, selectedExercise.name, 'best60')}
            title="Best · 60 days"
            className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 1.5L3.5 6.5H6.5L5 10.5" />
            </svg>
          </button>
        </div>
        {selectedExercise?.category === 'cardio' ? (
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Min"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSet()}
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm outline-none focus:border-orange-400 transition-colors"
            />
            <input
              type="number"
              placeholder="km (opt)"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSet()}
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm outline-none focus:border-orange-400 transition-colors"
            />
            <button
              onClick={handleAddSet}
              className="shrink-0 rounded-lg bg-orange-500 hover:bg-orange-600 px-4 py-2 text-sm font-bold text-white transition-colors"
            >
              Add
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-3">
            <Stepper
              label="Weight (kg)"
              value={Number(weight) || 0}
              min={0}
              max={500}
              step={2.5}
              onChange={(v) => setWeight(v > 0 ? String(v) : '')}
            />
            <Stepper
              label="Reps"
              value={Number(reps) || 0}
              min={0}
              max={50}
              onChange={(v) => setReps(v > 0 ? String(v) : '')}
            />
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <button
                onClick={openGuidedSetup}
                title="Guided set with DRUH tempo timer"
                className="rounded-lg border border-orange-400 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/20 px-3 py-2 text-sm font-bold transition-colors"
              >
                ▶ Guided
              </button>
              <button
                onClick={handleAddSet}
                className="rounded-lg bg-orange-500 hover:bg-orange-600 px-4 py-2 text-sm font-bold text-white transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        )}
        {addError && <p className="text-xs font-medium text-red-500">{addError}</p>}
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const dateLabel = new Date(workout.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })

  // ── Completed: read-only summary ─────────────────────────────────────────
  if (workout.status === 'completed' && !isEditing) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <button
            onClick={() => { window.location.href = '/dashboard' }}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            ← Back
          </button>
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-500">Completed</p>
            <h1 className="text-sm font-bold text-zinc-900 dark:text-white">{dateLabel}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={localSets.length === 0}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 disabled:opacity-40 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
            >
              Edit
            </button>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-6 py-6 flex flex-col gap-6">
          {localSets.length === 0 && (
            <p className="text-sm text-zinc-400 dark:text-zinc-600">No sets were logged.</p>
          )}
          {exerciseOrder.map((exerciseId) => {
            const group = grouped[exerciseId]
            return (
            <div key={exerciseId} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-900 dark:text-white">{group.name}</h2>
                <button
                  onClick={() => handleInfoClick(exerciseId)}
                  title="Exercise info"
                  className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none"
                >
                  i
                </button>
                <button
                  onClick={() => handlePerfClick(exerciseId, group.name, 'last')}
                  title="Last session"
                  className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="6" cy="6" r="5" />
                    <path d="M6 3v3l1.5 1.5" />
                  </svg>
                </button>
                <button
                  onClick={() => handlePerfClick(exerciseId, group.name, 'best')}
                  title="Best session"
                  className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3.5 1.5h5v3.5a2.5 2.5 0 0 1-5 0V1.5z" />
                    <path d="M6 7v1.5" />
                    <path d="M4 9h4" />
                    <path d="M1.5 2.5h2" />
                    <path d="M8.5 2.5h2" />
                  </svg>
                </button>
                <button
                  onClick={() => handlePerfClick(exerciseId, group.name, 'best60')}
                  title="Best · 60 days"
                  className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M7 1.5L3.5 6.5H6.5L5 10.5" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {group.sets.map((s, i) => (
                  <div
                    key={s.localId}
                    className="grid grid-cols-[2rem_1fr_1fr] items-center gap-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3"
                  >
                    <span className="text-xs font-bold text-zinc-400 dark:text-zinc-600">#{i + 1}</span>
                    {s.exerciseCategory === 'cardio' ? (
                      <>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 leading-none mb-0.5">Duration</p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">
                            {s.duration_minutes != null ? `${s.duration_minutes} min` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 leading-none mb-0.5">Distance</p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">
                            {s.distance != null ? `${s.distance} km` : '—'}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 leading-none mb-0.5">Weight</p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">
                            {s.weight != null ? `${s.weight} kg` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 leading-none mb-0.5">Reps</p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">
                            {s.reps != null ? s.reps : '—'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )})}
        </main>

        {infoLoading && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
            <div className="w-10 h-10 rounded-full border-2 border-zinc-600 border-t-orange-500 animate-spin" />
          </div>
        )}
        {infoExercise && (
          <ExerciseInfoModal
            exercise={infoExercise}
            onClose={() => setInfoExercise(null)}
            onMuscleClick={showPicker ? (m) => {
              setPickerActiveMuscles((prev) => [...new Set([...prev, m])])
              setInfoExercise(null)
            } : undefined}
          />
        )}
        {perfModal && (
          <LastPerfModal
            exerciseName={perfModal.name}
            title={PERF_TITLE[perfModal.mode]}
            data={perfData}
            loading={perfLoading}
            onClose={() => setPerfModal(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <button
          onClick={handleBack}
          className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          ← Back
        </button>
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-500">Active</p>
          <h1 className="text-sm font-bold text-zinc-900 dark:text-white">{dateLabel}</h1>
        </div>
        <div className="flex items-center gap-2">
          {localSets.length > 0 && (
            <button
              onClick={handleCopy}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}

          <button
            onClick={handleSaveProgress}
            disabled={isPending}
            className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-zinc-500 disabled:opacity-40 transition-colors"
          >
            Save
          </button>
          <button
            onClick={handleComplete}
            disabled={isPending}
            className="rounded-full bg-orange-500 hover:bg-orange-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-40 transition-colors"
          >
            {isPending ? '…' : 'Done'}
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-6 flex flex-col gap-6">

        {/* Rest — sticky at top (but not while a field is focused, so the mobile
            keyboard doesn't shove it around). Running timer when resting, else settings. */}
        <div className={`${fieldFocused ? '' : 'sticky top-0'} z-20 -mx-6 px-6 py-2 bg-zinc-50/95 dark:bg-black/95 backdrop-blur border-b border-zinc-200/60 dark:border-zinc-800/60`}>
          {restForSet !== null ? (
            <RestTimer
              key={`${restForSet}:${restNonce}`}
              initialMode={restMode}
              initialTarget={restTarget}
              onDone={finishRest}
              onSettingsChange={(m, t) => { setRestMode(m); setRestTarget(t) }}
            />
          ) : (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Rest</span>
              <button
                onClick={() => setRestMode((m) => (m === 'fixed' ? 'variable' : 'fixed'))}
                className="rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
              >
                {restMode === 'fixed' ? 'Fixed' : 'Variable'}
              </button>
              {restMode === 'fixed' && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setRestTarget((t) => Math.max(5, t - 5))} className="rounded-full border border-zinc-200 dark:border-zinc-700 w-8 py-1.5 font-bold text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors">−5</button>
                  <span className="font-black tabular-nums text-zinc-700 dark:text-zinc-300 w-12 text-center">{restTarget}s</span>
                  <button onClick={() => setRestTarget((t) => t + 5)} className="rounded-full border border-zinc-200 dark:border-zinc-700 w-8 py-1.5 font-bold text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors">+5</button>
                </div>
              )}
              {localSets.length > 0 && (
                <button
                  onClick={() => startRestFor(localSets[localSets.length - 1].localId)}
                  className="ml-auto rounded-full bg-orange-500 hover:bg-orange-600 px-4 py-1.5 font-bold uppercase tracking-wide text-white transition-colors"
                >
                  Start rest
                </button>
              )}
            </div>
          )}
        </div>

        {/* Exercise groups */}
        {exerciseOrder.map((exerciseId, exIdx) => {
          const group = grouped[exerciseId]
          return (
          <div key={exerciseId} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wide truncate">{group.name}</h2>
                <button
                  onClick={() => handleInfoClick(exerciseId)}
                  title="Exercise info"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none"
                >
                  i
                </button>
                <button
                  onClick={() => handlePerfClick(exerciseId, group.name, 'last')}
                  title="Last session"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="6" cy="6" r="5" />
                    <path d="M6 3v3l1.5 1.5" />
                  </svg>
                </button>
                <button
                  onClick={() => handlePerfClick(exerciseId, group.name, 'best')}
                  title="Best session"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3.5 1.5h5v3.5a2.5 2.5 0 0 1-5 0V1.5z" />
                    <path d="M6 7v1.5" />
                    <path d="M4 9h4" />
                    <path d="M1.5 2.5h2" />
                    <path d="M8.5 2.5h2" />
                  </svg>
                </button>
                <button
                  onClick={() => handlePerfClick(exerciseId, group.name, 'best60')}
                  title="Best · 60 days"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M7 1.5L3.5 6.5H6.5L5 10.5" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {exerciseOrder.length > 1 && (
                  <>
                    <button
                      onClick={() => moveExercise(exerciseId, 'up')}
                      disabled={exIdx === 0}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-20 transition-colors text-base leading-none"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveExercise(exerciseId, 'down')}
                      disabled={exIdx === exerciseOrder.length - 1}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-20 transition-colors text-base leading-none"
                    >
                      ↓
                    </button>
                  </>
                )}
                <button
                  onClick={() => openGuideSetup(exerciseId)}
                  title="Guide whole exercise (all sets, with rests)"
                  className="flex items-center gap-1 h-8 px-2.5 rounded-full border border-orange-400 text-orange-500 hover:bg-orange-500 hover:text-white transition-colors text-xs font-bold leading-none"
                >
                  ▶ All
                </button>
                <button
                  onClick={() => {
                    const ex = exercises.find((e) => e.id === exerciseId)
                    if (ex) handleSelectExercise(ex)
                  }}
                  className="flex items-center justify-center h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-orange-500 hover:text-white transition-colors text-lg leading-none"
                >
                  +
                </button>
              </div>
            </div>

            {fmtLastPerf(lastPerf[exerciseId]) && (
              <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                <span className="uppercase tracking-wide font-bold">Last:</span> {fmtLastPerf(lastPerf[exerciseId])}
              </p>
            )}
            {/* Personal note */}
            {notes[exerciseId] ? (
              <button
                onClick={() => setEditingNote({ exerciseId, name: group.name, text: notes[exerciseId] })}
                className="text-left text-xs rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 px-3 py-2 text-amber-800 dark:text-amber-300"
              >
                📝 {notes[exerciseId]}
              </button>
            ) : (
              <button
                onClick={() => setEditingNote({ exerciseId, name: group.name, text: '' })}
                className="self-start text-xs font-semibold text-zinc-400 hover:text-orange-500 transition-colors"
              >
                📝 Add note
              </button>
            )}

            <div className="flex flex-col gap-1.5">
              {group.sets.map((s, i) =>
                editingId === s.localId ? (
                  <div
                    key={s.localId}
                    className="flex items-center gap-3 rounded-xl bg-white dark:bg-zinc-900 border-2 border-orange-400 px-4 py-3"
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        saveEditSet(s.localId)
                      }
                    }}
                  >
                    <span className="text-xs font-bold text-orange-400 w-8 shrink-0">#{i + 1}</span>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      {s.exerciseCategory === 'cardio' ? (
                        <>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">Duration (min)</span>
                            <input
                              type="number"
                              value={editDuration}
                              onChange={(e) => setEditDuration(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && saveEditSet(s.localId)}
                              placeholder="—"
                              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-orange-400 transition-colors"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">Distance (km)</span>
                            <input
                              type="number"
                              value={editDistance}
                              onChange={(e) => setEditDistance(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && saveEditSet(s.localId)}
                              placeholder="—"
                              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-orange-400 transition-colors"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <Stepper
                            label="Weight (kg)"
                            value={Number(editWeight) || 0}
                            min={0}
                            max={500}
                            step={2.5}
                            onChange={(v) => setEditWeight(v > 0 ? String(v) : '')}
                          />
                          <Stepper
                            label="Reps"
                            value={Number(editReps) || 0}
                            min={0}
                            max={50}
                            onChange={(v) => setEditReps(v > 0 ? String(v) : '')}
                          />
                        </>
                      )}
                    </div>
                    {s.exerciseCategory !== 'cardio' && (
                      <button
                        onMouseDown={(e) => { e.preventDefault(); guidedFromEdit(s) }}
                        title="Guided set (adjust tempo, reps, weight)"
                        className="shrink-0 rounded-md border border-orange-400 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/20 px-2 py-1 text-xs font-bold transition-colors leading-none"
                      >
                        ▶
                      </button>
                    )}
                    <button
                      onMouseDown={(e) => { e.preventDefault(); completeFromEdit(s) }}
                      title="Complete this set"
                      className="shrink-0 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-1 text-xs font-bold transition-colors leading-none"
                    >
                      ✓ Complete
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-zinc-300 dark:text-zinc-700 hover:text-red-500 transition-colors text-sm shrink-0">✕</button>
                  </div>
                ) : (
                  <div
                    key={s.localId}
                    className={`grid grid-cols-[1.5rem_1.25rem_1fr_1fr_auto] items-center gap-2 rounded-xl border px-3 py-3 cursor-pointer transition-colors ${
                      s.done
                        ? 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-orange-400 dark:hover:border-orange-500'
                        : 'bg-zinc-50/60 dark:bg-zinc-900/40 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-orange-400'
                    }`}
                    onClick={() => startEditSet(s)}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleDone(s.localId) }}
                      title={s.done ? 'Completed — tap to undo' : 'Mark set done (starts rest)'}
                      className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                        s.done
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-zinc-300 dark:border-zinc-600 text-transparent hover:border-emerald-400'
                      }`}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3 5-6" /></svg>
                    </button>
                    <span className="text-xs font-bold text-zinc-400 dark:text-zinc-600">#{i + 1}</span>
                    {s.exerciseCategory === 'cardio' ? (
                      <>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 leading-none mb-0.5">Duration</p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">
                            {s.duration_minutes != null ? `${s.duration_minutes} min` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 leading-none mb-0.5">Distance</p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">
                            {s.distance != null ? `${s.distance} km` : '—'}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 leading-none mb-0.5">Weight</p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">
                            {s.weight != null ? `${s.weight} kg` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 leading-none mb-0.5">Reps</p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">
                            {s.reps != null ? s.reps : '—'}
                          </p>
                        </div>
                      </>
                    )}
                    <div className="flex items-center gap-1.5 justify-end">
                      {!s.done && s.exerciseCategory !== 'cardio' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openGuidedSetupForSet(s) }}
                          title="Guided set (adjust tempo, reps, weight)"
                          className="shrink-0 rounded-md border border-orange-400 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/20 px-2 py-1 text-xs font-bold transition-colors leading-none"
                        >
                          ▶
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSet(s.localId) }}
                        className="text-zinc-300 hover:text-red-500 dark:text-zinc-700 dark:hover:text-red-500 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
            {selectedExercise?.id === exerciseId && renderAddSetForm()}
          </div>
        )})}

        {localSets.length === 0 && !selectedExercise && (
          <p className="text-sm font-medium text-zinc-400 dark:text-zinc-600">
            No sets yet. Pick an exercise or load a template.
          </p>
        )}

        {/* Load template + Paste buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleOpenImport}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 py-3 text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
          >
            ↓ Load template
          </button>
          {clipboard && (
            <button
              onClick={handlePasteRequest}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-orange-400 py-3 text-xs font-bold uppercase tracking-widest text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors"
            >
              ⎘ Paste
            </button>
          )}
        </div>

        {/* Form for a newly-selected exercise not yet in the list */}
        {selectedExercise && !exerciseOrder.includes(selectedExercise.id) && renderAddSetForm()}

        {/* Add exercise button — always visible unless a new exercise form is showing */}
        {(!selectedExercise || exerciseOrder.includes(selectedExercise.id)) && (
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 py-5 text-sm font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 hover:border-orange-400 hover:text-orange-500 transition-colors"
          >
            + Add exercise
          </button>
        )}

      </main>

      {/* Exercise info spinner + modal */}
      {infoLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="w-10 h-10 rounded-full border-2 border-zinc-600 border-t-orange-500 animate-spin" />
        </div>
      )}
      {infoExercise && (
        <ExerciseInfoModal
          exercise={infoExercise}
          onClose={() => setInfoExercise(null)}
          onMuscleClick={showPicker ? (m) => {
            setPickerActiveMuscles((prev) => [...new Set([...prev, m])])
            setInfoExercise(null)
          } : undefined}
        />
      )}
      {perfModal && (
        <LastPerfModal
          exerciseName={perfModal.name}
          title={PERF_TITLE[perfModal.mode]}
          data={perfData}
          loading={perfLoading}
          onClose={() => setPerfModal(null)}
        />
      )}

      {/* Exercise picker */}
      {showPicker && (
        <ExercisePickerSheet
          exercises={exercises}
          activeMuscles={pickerActiveMuscles}
          onMusclesChange={setPickerActiveMuscles}
          activeCategories={pickerActiveCategories}
          onCategoriesChange={setPickerActiveCategories}
          onSelect={handleSelectExercise}
          onInfoClick={handleInfoClick}
          onPerfClick={handlePerfClick}
          onClose={() => {
            setShowPicker(false)
            setPickerActiveMuscles([])
            setPickerActiveCategories([])
          }}
        />
      )}

      {/* Template import picker */}
      {showImportPicker && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
          onClick={() => setShowImportPicker(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl max-h-[75vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Load template</p>
            </div>
            <ul className="overflow-y-auto flex-1">
              {loadingTemplates && (
                <li className="flex items-center justify-center py-10">
                  <div className="w-8 h-8 rounded-full border-2 border-zinc-600 border-t-orange-500 animate-spin" />
                </li>
              )}
              {!loadingTemplates && templates?.length === 0 && (
                <li className="px-5 py-6 text-sm text-zinc-400 dark:text-zinc-600">
                  No templates yet. Create one in Workouts.
                </li>
              )}
              {templates?.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => handleImportTemplate(t)}
                    className="w-full text-left px-5 py-3.5 hover:bg-orange-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                  >
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">{t.name}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-600 mt-0.5">
                      {t.routine_exercises.length} exercise{t.routine_exercises.length !== 1 ? 's' : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Save progress warning */}
      {showSaveWarning && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-1">Heads up</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Progress won't be tracked</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Sets are saved but this workout won't count toward exercise history. Hit <strong>Done</strong> when you finish to track your progress.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSaveWarning(false)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSaveProgress}
                disabled={isPending}
                className="flex-1 rounded-xl bg-zinc-800 dark:bg-zinc-700 py-2.5 text-sm font-bold text-white hover:bg-zinc-700 transition-colors disabled:opacity-40"
              >
                Save anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paste overwrite confirmation */}
      {showPasteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-1">Overwrite?</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Replace current sets?</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Your current sets will be replaced with the clipboard content.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowPasteConfirm(false)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyPaste}
                className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 py-2.5 text-sm font-bold text-white transition-colors"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard edits prompt (editing a completed workout) */}
      {showDiscardEditsPrompt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-red-500 mb-1">Warning</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Discard changes?</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Your edits will not be saved.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDiscardEditsPrompt(false)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Keep editing
              </button>
              <button
                onClick={() => { setShowDiscardEditsPrompt(false); setIsEditing(false) }}
                className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 py-2.5 text-sm font-bold text-white transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Abandon workout prompt */}
      {showAbandonPrompt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-red-500 mb-1">Warning</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Abandon workout?</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Your sets will not be saved.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAbandonPrompt(false)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Keep going
              </button>
              <button
                onClick={() => { window.location.href = '/dashboard' }}
                className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 py-2.5 text-sm font-bold text-white transition-colors"
              >
                Abandon
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guided-set tempo setup */}
      {guidedSetup && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[75] px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-1">Guided set</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white truncate">{guidedSetup.exercise.name}</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Stepper
                label="Goal reps"
                value={Number(guidedSetup.goalReps) || 0}
                min={1}
                max={50}
                onChange={(v) => setGuidedSetup((g) => (g ? { ...g, goalReps: String(v) } : g))}
              />
              <Stepper
                label="Weight (kg)"
                value={Number(guidedSetup.weight) || 0}
                min={0}
                max={500}
                step={2.5}
                onChange={(v) => setGuidedSetup((g) => (g ? { ...g, weight: v > 0 ? String(v) : '' } : g))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">Tempo (sec per phase)</span>
                <span className="text-xs font-black tabular-nums text-orange-500">{formatTempo(tempo)}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <Stepper label="Down" sublabel="lower" value={tempo.down} min={0} max={10} onChange={(v) => setTempo((t) => ({ ...t, down: v }))} />
                <Stepper label="Rest" sublabel="bottom" value={tempo.rest} min={0} max={10} onChange={(v) => setTempo((t) => ({ ...t, rest: v }))} />
                <Stepper label="Up" sublabel="lift" value={tempo.up} min={0} max={10} onChange={(v) => setTempo((t) => ({ ...t, up: v }))} />
                <Stepper label="Hold" sublabel="top" value={tempo.hold} min={0} max={10} onChange={(v) => setTempo((t) => ({ ...t, hold: v }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setGuidedSetup(null)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={startGuided}
                className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 py-2.5 text-sm font-bold text-white transition-colors"
              >
                Start
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Running DRUH timer */}
      {runningDruh && (
        <DruhTimer
          tempo={tempo}
          goalReps={runningDruh.goalReps}
          onStop={handleGuidedStop}
          onCancel={() => setRunningDruh(null)}
        />
      )}

      {/* Per-exercise note editor */}
      {editingNote && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[75] px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-1">Note</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white truncate">{editingNote.name}</h3>
            </div>
            <textarea
              autoFocus
              rows={4}
              value={editingNote.text}
              onChange={(e) => setEditingNote((n) => (n ? { ...n, text: e.target.value } : n))}
              placeholder="e.g. seat height 4, narrow grip, elbows tucked…"
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-orange-400 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setEditingNote(null)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNote}
                className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 py-2.5 text-sm font-bold text-white transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Whole-exercise guide SETUP */}
      {guideSetup && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[75] px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-1">Guide exercise</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white truncate">{guideSetup.exerciseName}</h3>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">Tempo</span>
              <div className="grid grid-cols-4 gap-2">
                <Stepper label="Down" sublabel="lower" value={tempo.down} min={0} max={10} onChange={(v) => setTempo((t) => ({ ...t, down: v }))} />
                <Stepper label="Rest" sublabel="bottom" value={tempo.rest} min={0} max={10} onChange={(v) => setTempo((t) => ({ ...t, rest: v }))} />
                <Stepper label="Up" sublabel="lift" value={tempo.up} min={0} max={10} onChange={(v) => setTempo((t) => ({ ...t, up: v }))} />
                <Stepper label="Hold" sublabel="top" value={tempo.hold} min={0} max={10} onChange={(v) => setTempo((t) => ({ ...t, hold: v }))} />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">Per-set goals</span>
              {guideSetup.rows.map((r, i) => (
                <div key={r.localId} className="flex items-end gap-3">
                  <span className="text-xs font-bold text-zinc-400 w-8 pb-2">#{i + 1}</span>
                  <Stepper label="Reps" value={r.reps} min={1} max={50} onChange={(v) => updateGuideRow(r.localId, { reps: v })} />
                  <Stepper label="Weight" sublabel="kg" value={r.weight} min={0} max={500} step={2.5} onChange={(v) => updateGuideRow(r.localId, { weight: v })} />
                  <button
                    onClick={() => removeGuideRow(r.localId)}
                    disabled={guideSetup.rows.length <= 1}
                    className="text-zinc-300 hover:text-red-500 dark:text-zinc-700 pb-2 text-lg leading-none disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={addGuideRow}
                className="self-start rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
              >
                + Add set
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setGuideSetup(null)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={startGuideAll}
                className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 py-2.5 text-sm font-bold text-white transition-colors"
              >
                Start guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Whole-exercise guide (set → rest → set …) */}
      {guidingExerciseId != null && (
        <ExerciseGuide
          exerciseName={grouped[guidingExerciseId]?.name ?? ''}
          tempo={tempo}
          sets={guideSetsFor(guidingExerciseId)}
          restSeconds={restTarget}
          onDone={handleGuideDone}
        />
      )}
    </div>
  )
}
