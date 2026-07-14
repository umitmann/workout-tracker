'use client'

import { useState, useTransition, useEffect, useMemo, useRef } from 'react'
import { saveWorkoutProgress, completeWorkout, deleteWorkout, SetPayload } from '@/app/actions/workouts'
import { createSaveQueue, SaveState } from '@/lib/saveQueue'
import { fetchExerciseDetails, fetchLastExercisePerformance, fetchBestExercisePerformance, fetchBestExercisePerformance60Days } from '@/app/actions/exercises'
import { fetchUserTemplates } from '@/app/actions/templates'
import { fetchExerciseNotes, saveExerciseNote } from '@/app/actions/notes'
import type { LastExercisePerformance, RoutineWithExercises } from '@/lib/dal'
import ExercisePickerSheet, { SlimExercise } from './ExercisePickerSheet'
import ExerciseInfoModal from './ExerciseInfoModal'
import LastPerfModal from './LastPerfModal'
import Modal from '@/components/Modal'
import DruhTimer from './DruhTimer'
import RestTimer from './RestTimer'
import ExerciseGuide, { GuideSet } from './ExerciseGuide'
import Stepper from './Stepper'
import { useWorkoutClipboard } from '@/lib/WorkoutClipboardContext'
import { useWakeLock } from './useWakeLock'
import { TempoConfig, repDuration, formatTempo, parseTempo } from '@/lib/tempo'
import { startsRestOnComplete, formatRestRow, shouldStickRestBar, canStartRestImplicitly, resolveRestTarget } from '@/lib/restTimer'
import { deriveInitialSets } from '@/lib/deriveInitialSets'
import { expandTemplate } from '@/lib/expandTemplate'
import {
  LocalSet,
  addSet as addSetOp,
  deleteSet as deleteSetOp,
  applyEdit,
  reorderExercise,
  recordRestForSet,
  requestSetDelete,
  commitPending,
  resolveEditFields,
  setDifficulty,
  mergeIncomingSets,
  mergeGuideResults,
  MergeMode,
  restoreSnapshot,
} from '@/lib/setListOps'
import { buildClipboardEntries, clipboardEntriesToLocalSets } from '@/lib/clipboardOps'
import IconHitTarget from './IconHitTarget'
import { localDateStr } from '@/lib/localDate'
import { DistanceUnit, formatDistance, convertKmTo, readDistanceUnitPref, writeDistanceUnitPref } from '@/lib/distanceUnit'

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
  video_url?: string | null
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
    difficulty?: number | null
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

// Tile 10c: always-visible 1-5 difficulty chip for a non-cardio set row —
// blank until tapped, editable after the fact, never required. `onSelect`
// omitted renders a read-only variant (completed view): the numbers still
// show which one (if any) was picked, but nothing is tappable.
function DifficultyChip({
  value,
  onSelect,
}: {
  value: number | null
  onSelect?: (n: number) => void
}) {
  const readOnly = !onSelect
  if (readOnly && value == null) return null
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {!readOnly && (
        <span className="text-[0.65rem] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 mr-0.5">
          Difficulty
        </span>
      )}
      {[1, 2, 3, 4, 5]
        .filter((n) => !readOnly || n === value)
        .map((n) => (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => onSelect?.(n)}
            title={`Difficulty ${n}${readOnly ? '' : ' of 5'}`}
            className={`w-5 h-5 rounded-full border text-[0.65rem] font-bold flex items-center justify-center leading-none transition-colors ${
              value === n
                ? 'bg-orange-500 border-orange-500 text-white'
                : 'border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-600 hover:border-orange-400 hover:text-orange-500'
            } ${readOnly ? 'cursor-default' : ''}`}
          >
            {n}
          </button>
        ))}
    </div>
  )
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
  // Tile 4/13: paste and import share one non-empty-workout prompt
  // (Overwrite / Append / cancel) instead of each silently wiping or
  // maintaining its own copy of the same modal.
  const [pendingApply, setPendingApply] = useState<
    { source: 'paste' } | { source: 'import'; template: RoutineWithExercises } | null
  >(null)
  const [isEditing, setIsEditing] = useState(false)
  // Tile 15: captured the moment Edit is entered on a completed workout —
  // Back → Discard restores localSets to exactly this (and persists that
  // restoration), reverting every edit made since, including ones that
  // already autosaved. Null while not editing a completed workout.
  const [editSnapshot, setEditSnapshot] = useState<LocalSet[] | null>(null)
  // ADR-0007: wake lock is owned at the session level for the whole active
  // logging session (docked rest + plain set entry included), not just
  // inside the full-screen guided timers — single owner, no per-timer
  // double-acquire. Read-only completed views hold no lock, but EDITING a
  // completed workout is a full interactive session (timers included) and
  // must hold one.
  useWakeLock(workout.status !== 'completed' || isEditing)

  // All sets live in client state only — committed on Finish. §2 invariants
  // (completed never falls back to template) are enforced by deriveInitialSets.
  const [localSets, setLocalSets] = useState<LocalSet[]>(() => deriveInitialSets(workout, initialTemplate ?? null))

  // ADR-0004: one serialized save queue per mounted logger, keyed by workout
  // id. Every persistence call site goes through `persist()` below, which
  // enqueues here instead of firing an unserialized saveWorkoutProgress —
  // this is what makes rapid adds (§15.3) land in order instead of racing.
  const saveQueueRef = useRef(createSaveQueue<LocalSet[]>((sets) => saveWorkoutProgress(workout.id, sets.map(toPayload))))
  const [saveState, setSaveState] = useState<SaveState>(() => saveQueueRef.current.getState(String(workout.id)))

  // D6: the queue auto-retries a failed save internally (bounded, jittered
  // backoff) — subscribe so the save-state strip renders every transition
  // (pending → retrying → error/clean), not just the state once enqueue()'s
  // promise finally settles after the whole retry cycle.
  useEffect(() => {
    const key = String(workout.id)
    setSaveState(saveQueueRef.current.getState(key))
    return saveQueueRef.current.subscribe(key, setSaveState)
  }, [workout.id])

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
  // WP-12 (checklist §19.10/§19.11): distance display unit preference.
  // Persisted via distanceUnit.ts's own read/write helpers (not the generic
  // readStored/writeStored above) so BodyweightCard's report export can
  // share the exact same storage key/shape without importing this component.
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(() => readDistanceUnitPref())

  // PT-prescribed tempo per exercise, from the template this workout came from.
  const ptTempo = useMemo(() => {
    const map: Record<number, TempoConfig> = {}
    for (const ex of initialTemplate?.routine_exercises ?? []) {
      const t = ex.tempo ? parseTempo(ex.tempo) : null
      if (t) map[ex.exercise_id] = t
    }
    return map
  }, [initialTemplate])

  // PT-prescribed rest target per exercise, from the template this workout
  // came from (Tile 6 / D4). Resolved via `resolveRestTarget` against the
  // global `restTarget` stepper — no per-exercise learned memory.
  const ptRest = useMemo(() => {
    const map: Record<number, number> = {}
    for (const ex of initialTemplate?.routine_exercises ?? []) {
      if (ex.rest_seconds != null) map[ex.exercise_id] = ex.rest_seconds
    }
    return map
  }, [initialTemplate])

  useEffect(() => { writeStored('wt.tempo', tempo) }, [tempo])
  useEffect(() => { writeStored('wt.restMode', restMode) }, [restMode])
  useEffect(() => { writeStored('wt.restTarget', restTarget) }, [restTarget])
  useEffect(() => { writeDistanceUnitPref(distanceUnit) }, [distanceUnit])
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
  // Wall-clock moment the current rest began (Date.now()), tracked alongside
  // RestTimer's own internal clock so the explicit force-restart path (which
  // renders outside <RestTimer>) can compute "current elapsed" itself without
  // reaching into that component's state.
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null)

  // D5 (sacred rest): a running rest timer is never reset or re-pointed by an
  // implicit action. This is the ONLY entry point implicit callers (toggleDone,
  // handleAddSet, completeFromEdit, handleGuidedStop) use — if a rest is
  // already running for some set, this is a no-op; the running timer and the
  // set it belongs to are left completely untouched.
  function startRestFor(localId: string) {
    if (!canStartRestImplicitly(restForSet)) return
    setRestForSet(localId)
    setRestNonce((n) => n + 1)
    setRestStartedAt(Date.now())
  }

  // The ONE deliberate restart: the explicit "Start rest" button. Unlike
  // `startRestFor`, this always proceeds — if a rest is currently running, its
  // elapsed is logged to the set it was running for first, then a fresh
  // 0:00 timer starts for `localId`.
  function forceRestartRestFor(localId: string) {
    if (restForSet !== null && restStartedAt !== null) {
      const elapsedSeconds = Math.round((Date.now() - restStartedAt) / 1000)
      logRestElapsed(restForSet, elapsedSeconds)
    }
    setRestForSet(localId)
    setRestNonce((n) => n + 1)
    setRestStartedAt(Date.now())
  }
  // exerciseId currently being guided as a whole (full-screen set→rest→set…)
  const [guidingExerciseId, setGuidingExerciseId] = useState<number | null>(null)
  // Setup screen for the whole-exercise guide (edit per-set reps/weight + tempo)
  const [guideSetup, setGuideSetup] = useState<{
    exerciseId: number
    exerciseName: string
    rows: { localId: string; reps: number; weight: number }[]
  } | null>(null)
  // Tile 12: batched end-of-guide rep review — rather than interrupting each
  // set with a confirm, the guide-all's `onDone` results are staged here for
  // one editable review before they're written back to `localSets`. Nothing
  // is committed until the review is confirmed.
  const [guideReview, setGuideReview] = useState<{
    exerciseName: string
    results: { localId: string; reps: number; weight: number | null; goalReps: number }[]
  } | null>(null)

  // Sheets & modals
  const [showPicker, setShowPicker] = useState(false)
  const [showImportPicker, setShowImportPicker] = useState(false)
  // Tile 1: Back on an active workout with ≥1 set opens a sheet with exactly
  // Save & leave / Delete workout — leaving never implies lost data. Delete
  // is a second, separate confirm step (showDeleteConfirm).
  const [showLeaveSheet, setShowLeaveSheet] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDiscardEditsPrompt, setShowDiscardEditsPrompt] = useState(false)
  const [showSaveWarning, setShowSaveWarning] = useState(false)
  const [savedOnce, setSavedOnce] = useState(false)
  const [infoExercise, setInfoExercise] = useState<ExerciseDetails | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  type PerfMode = 'last' | 'best' | 'best60'
  const PERF_TITLE: Record<PerfMode, string> = { last: 'Last session', best: 'Best session', best60: 'Best · 60 days' }
  const [perfModal, setPerfModal] = useState<{ id: number; name: string; mode: PerfMode; category: string | null } | null>(null)
  const [perfData, setPerfData] = useState<LastExercisePerformance | null>(null)
  const [perfLoading, setPerfLoading] = useState(false)

  // Template import
  const [templates, setTemplates] = useState<RoutineWithExercises[] | null>(null)
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Warn on browser tab close / refresh — for active workouts with sets, and
  // unconditionally while a save has failed or is still pending (ADR-0004:
  // the guard must stay armed until the failure is resolved, not just while
  // localSets happens to be non-empty).
  useEffect(() => {
    if (workout.status === 'completed') return
    const handler = (e: BeforeUnloadEvent) => {
      if (localSets.length > 0 || saveState.dirty || saveState.pending || saveState.error) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [workout.status, localSets.length, saveState])

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
    const { exerciseId, name, text } = editingNote
    const previous = notes[exerciseId]
    setNotes((prev) => ({ ...prev, [exerciseId]: text.trim() }))
    setEditingNote(null)
    startTransition(async () => {
      // Revert the optimistic note if the save fails (returned or thrown) —
      // otherwise the note looks saved but was never persisted.
      try {
        const result = await saveExerciseNote(exerciseId, text)
        if (result?.error) throw new Error(result.error)
      } catch {
        setNotes((prev) => ({ ...prev, [exerciseId]: previous ?? '' }))
        setEditingNote({ exerciseId, name, text })
      }
    })
  }

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleSelectExercise(ex: SlimExercise) {
    // Tile 9: switching exercises leaves behind whatever is typed in the
    // current add form — flush it as a not-done set first (no-op if empty/unselected).
    autoCommitAddForm()
    const previous = [...localSets].reverse().find((s) => s.exerciseId === ex.id)
    // Tile 8: no set logged for this exercise yet THIS workout — fall back to
    // the previous completed session's last set for it, so the form is only
    // ever blank when there's truly no history at all.
    const priorSets = lastPerf[ex.id]?.sets
    const priorSet = priorSets && priorSets.length > 0 ? priorSets[priorSets.length - 1] : null
    setSelectedExercise(ex)
    setShowPicker(false)
    if (ex.category === 'cardio') {
      setDuration(previous?.duration_minutes != null ? String(previous.duration_minutes) : priorSet?.duration_minutes != null ? String(priorSet.duration_minutes) : '')
      setDistance(previous?.distance != null ? String(previous.distance) : priorSet?.distance != null ? String(priorSet.distance) : '')
      setWeight('')
      setReps('')
    } else {
      setWeight(previous?.weight != null ? String(previous.weight) : priorSet?.weight != null ? String(priorSet.weight) : '')
      setReps(previous?.reps != null ? String(previous.reps) : priorSet?.reps != null ? String(priorSet.reps) : '')
      setDuration('')
      setDistance('')
    }
    setAddError(null)
  }

  // Tile 9: flushes whatever is currently typed in the add-set form into a
  // NOT-DONE set (never done, never starts rest) — called whenever the form
  // is about to be left behind (exercise switch, tap-away blur). A fully-empty
  // form is a no-op — never commits a phantom empty set. Persists immediately
  // via the same save queue as a real Add (D6), so it survives a reload.
  function autoCommitAddForm() {
    if (!selectedExercise) return
    const isCardio = selectedExercise.category === 'cardio'
    const newSet = commitPending(
      { weight, reps, duration_minutes: duration, distance },
      {
        localId: crypto.randomUUID(),
        exerciseId: selectedExercise.id,
        exerciseName: selectedExercise.name,
        exerciseCategory: selectedExercise.category,
      },
      isCardio,
    )
    if (!newSet) return
    const nextSets = addSetOp(localSets, newSet)
    setLocalSets(nextSets)
    setWeight('')
    setReps('')
    setDuration('')
    setDistance('')
    setAddError(null)
    persist(nextSets)
    // Deliberately no startRestFor — auto-commit never starts rest (Tile 6/D5).
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
      difficulty: null,
      done: true,
    }
    const nextSets = addSetOp(localSets, newSet)
    setLocalSets(nextSets)
    // Completing a set (plain add) auto-starts rest for it.
    if (startsRestOnComplete(selectedExercise.category)) startRestFor(newSet.localId)
    // Tile 10a: re-seed from the just-logged set instead of blanking — straight
    // sets are Add, Add, Add with no re-entry ("always goes back to 12.5").
    setWeight(newSet.weight != null ? String(newSet.weight) : '')
    setReps(newSet.reps != null ? String(newSet.reps) : '')
    setDuration(newSet.duration_minutes != null ? String(newSet.duration_minutes) : '')
    setDistance(newSet.distance != null ? String(newSet.distance) : '')
    setAddError(null)
    setSavedOnce(true)
    persist(nextSets)
  }

  // ADR-0004: every persistence call site goes through the save queue and
  // inspects its result (finding C2 — no more fire-and-forget). The queue
  // serializes/coalesces per workout id; this function's only job is to keep
  // `saveState` in sync with it for the aria-live indicator + beforeunload guard.
  function persist(sets: LocalSet[]) {
    startTransition(async () => {
      await saveQueueRef.current.enqueue(String(workout.id), sets)
      setSaveState(saveQueueRef.current.getState(String(workout.id)))
    })
  }

  // §15.6/§15.7: inline edits and deletes are local-only — they mark the
  // queue dirty so the "unsaved changes" indicator lights up, but only a
  // subsequent Save/Done (or the next autosaved add) actually persists them.
  function markDirty() {
    saveQueueRef.current.markDirty(String(workout.id))
    setSaveState(saveQueueRef.current.getState(String(workout.id)))
  }

  function handleDeleteSet(localId: string) {
    setLocalSets((prev) => deleteSetOp(prev, localId))
    markDirty()
  }

  // ADR-0008 (WP-09): two-tap confirm for the set-delete ✕, mirroring the
  // calendar's confirmDeleteId pattern. First tap arms `pendingDeleteId`;
  // tapping the same ✕ again confirms and actually deletes.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  function handleDeleteTap(localId: string) {
    const { pendingId, confirmed } = requestSetDelete(pendingDeleteId, localId)
    setPendingDeleteId(pendingId)
    if (confirmed) handleDeleteSet(localId)
  }

  function cancelDeleteTap() {
    setPendingDeleteId(requestSetDelete.cancel())
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

  // Tile 10c: tapping a difficulty chip persists immediately (same save path
  // as ✓/Add — a plain value change), independent of ✓/Complete/Done. Tapping
  // the already-selected value clears it (setDifficulty toggles to null).
  function handleSetDifficulty(localId: string, n: number) {
    const nextSets = setDifficulty(localSets, localId, n)
    setLocalSets(nextSets)
    persist(nextSets)
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

  // Called when the DRUH timer stops (goal reached, or the Tile 11
  // confirm/adjust step is saved). Uses functional `setLocalSets` updates —
  // not the `localSets` closed over by this render — so the write always
  // applies against the CURRENT set list rather than a snapshot from
  // whichever render happened to create this particular callback (the same
  // stale-closure hazard root-caused in `handleGuideDone` below).
  function handleGuidedStop(completedReps: number) {
    if (!runningDruh) return
    const targetId = runningDruh.targetLocalId
    const goalWeight = runningDruh.weight

    // Filling an existing scheduled set: record actual reps, mark done, rest.
    if (targetId) {
      setRunningDruh(null)
      if (completedReps <= 0) return // did nothing → leave the set pending
      let nextSets: LocalSet[] = []
      setLocalSets((prev) => {
        nextSets = prev.map((s) =>
          s.localId === targetId ? { ...s, reps: completedReps, weight: goalWeight, done: true } : s,
        )
        return nextSets
      })
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
      difficulty: null,
      done: true,
    }
    let nextSets: LocalSet[] = []
    setLocalSets((prev) => {
      nextSets = [...prev, newSet]
      return nextSets
    })
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
        difficulty: null,
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

  // Called when the whole-exercise guide finishes OR Exit is tapped.
  //
  // Tile 12b root cause (CONFIRMED bug — "Exit loses the first exercise"):
  // `ExerciseGuide`'s rAF loop is set up once in a mount-time `useEffect` and
  // self-perpetuates via `requestAnimationFrame(loop)`, so every call to
  // `finish()` — including the one Exit triggers — invokes the `onDone` prop
  // exactly as it was bound at MOUNT. The old code merged results by mapping
  // over the OUTER `localSets` closed over by that particular render of
  // `handleGuideDone`; if a stale reference to that mount-time function ever
  // fired (or any other code path called it against an out-of-date `localSets`
  // capture), it would write back a snapshot that clobbers every exercise the
  // guide didn't touch — including exercise A, sitting untouched before B.
  //
  // The fix: `handleGuideDone` itself no longer touches `localSets` at all —
  // it only stages the raw results for review. The actual merge
  // (`commitGuideReview` below) runs from a plain button click in a fresh
  // render, so it always reads/writes the CURRENT `localSets`, never a
  // snapshot. `mergeGuideResults` (setListOps.ts) is the pure, independently
  // tested merge step, and per Tile 12b's invariant it only ever touches sets
  // whose localId is in the results — every other exercise passes through
  // byte-for-byte untouched, regardless of when this fires.
  function handleGuideDone(results: { localId: string; reps: number }[]) {
    const exerciseId = guidingExerciseId
    setGuidingExerciseId(null)
    if (results.length === 0 || exerciseId == null) return // nothing completed — no-op, nothing lost
    const exerciseName = grouped[exerciseId]?.name ?? ''
    setGuideReview({
      exerciseName,
      results: results.map((r) => {
        // `localSets` still holds the PRE-guide values here (the review's
        // commit hasn't run yet) — that set's `reps` is exactly the goal
        // `guideSetsFor` read when the guide started.
        const s = localSets.find((x) => x.localId === r.localId)
        return { localId: r.localId, reps: r.reps, weight: s?.weight ?? null, goalReps: s?.reps ?? r.reps }
      }),
    })
  }

  function updateGuideReviewReps(localId: string, reps: number) {
    setGuideReview((g) =>
      g ? { ...g, results: g.results.map((r) => (r.localId === localId ? { ...r, reps } : r)) } : g,
    )
  }

  // Commits the (possibly-adjusted) end-of-guide review — the ONLY place the
  // guide's results are actually written back to `localSets`. Runs from a
  // fresh render's onClick, so `localSets` here is always current.
  function commitGuideReview() {
    if (!guideReview) return
    const nextSets = mergeGuideResults(localSets, guideReview.results)
    setLocalSets(nextSets)
    setSavedOnce(true)
    persist(nextSets)
    setGuideReview(null)
  }

  // ── Rest timer ─────────────────────────────────────────────────────────────

  // Shared by the normal Done path and the explicit force-restart path: logs
  // elapsed rest seconds onto the set the (now-ending) timer was running for.
  function logRestElapsed(targetId: string, elapsedSeconds: number) {
    const nextSets = recordRestForSet(localSets, targetId, elapsedSeconds)
    setLocalSets(nextSets)
    persist(nextSets)
  }

  function finishRest(elapsedSeconds: number) {
    const target = restForSet
    setRestForSet(null)
    setRestStartedAt(null)
    if (!target) return // rest with no set to attach to
    logRestElapsed(target, elapsedSeconds)
  }

  function startEditSet(s: LocalSet) {
    setEditingId(s.localId)
    setEditWeight(s.weight != null ? String(s.weight) : '')
    setEditReps(s.reps != null ? String(s.reps) : '')
    setEditDuration(s.duration_minutes != null ? String(s.duration_minutes) : '')
    setEditDistance(s.distance != null ? String(s.distance) : '')
  }

  // Tile 9(b): tapping away from the inline editor without ✓/Complete keeps
  // it typed value AND — crucially — never nulls a field the user cleared.
  // An emptied field falls back to the set's PRIOR value (`resolveEditFields`),
  // mirroring `completeFromEdit`'s fallback, so clearing-then-blurring is not
  // a data-loss path. `done` is untouched here, so a done set stays done and
  // a not-done set stays not-done — auto-commit's "not-done" only ever
  // applies to a never-completed entry, which this already is.
  function saveEditSet(localId: string) {
    const target = localSets.find((s) => s.localId === localId)
    if (!target) { setEditingId(null); return }
    const isCardio = target.exerciseCategory === 'cardio'
    const fields = resolveEditFields(
      { weight: editWeight, reps: editReps, duration_minutes: editDuration, distance: editDistance },
      target,
      isCardio,
    )
    setLocalSets((prev) => applyEdit(prev, localId, fields))
    setEditingId(null)
    markDirty()
  }

  async function handleInfoClick(exerciseId: number) {
    setInfoLoading(true)
    const details = await fetchExerciseDetails(exerciseId)
    setInfoLoading(false)
    if (details) setInfoExercise(details as ExerciseDetails)
  }

  async function handlePerfClick(exerciseId: number, exerciseName: string, mode: PerfMode, category: string | null = null) {
    setPerfModal({ id: exerciseId, name: exerciseName, mode, category })
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

  // Tile 13a: mirrors handlePasteRequest — an empty workout imports
  // straight away (nothing to lose); a non-empty one goes through the same
  // Overwrite/Append/cancel prompt as Paste instead of silently replacing.
  function handleImportTemplate(template: RoutineWithExercises) {
    if (localSets.length === 0) {
      applyIncomingSets(expandTemplate(template.routine_exercises), 'overwrite')
      setShowImportPicker(false)
      return
    }
    setShowImportPicker(false)
    setPendingApply({ source: 'import', template })
  }

  function handleBack() {
    // Tile 9 safety net: Back is a "navigate away" — flush any typed-but-
    // uncommitted add-form values (no-op if empty/unselected) so they're
    // never silently dropped, regardless of blur/focus ordering.
    autoCommitAddForm()
    if (workout.status === 'completed') {
      if (isEditing) { setShowDiscardEditsPrompt(true); return }
      window.location.href = '/dashboard'
      return
    }
    // Tile 1: an active workout is NEVER lost by navigating away — the sheet
    // just offers to save-then-leave or explicitly delete. Nothing here
    // implies leaving alone loses data.
    if (localSets.length > 0) {
      setShowLeaveSheet(true)
    } else {
      window.location.href = '/dashboard'
    }
  }

  // Tile 1: flush the latest snapshot through the save queue (this also
  // waits out any already-in-flight/retrying save via the queue's per-key
  // coalescing) before navigating away. The workout stays in_progress and
  // is fully resumable either way. If the flush can't land clean (still
  // dirty or errored after the attempt), stay on the page and surface the
  // save-state banner instead of navigating away from an unsaved edit.
  async function handleSaveAndLeave() {
    setShowLeaveSheet(false)
    const key = String(workout.id)
    await saveQueueRef.current.enqueue(key, localSets)
    const state = saveQueueRef.current.getState(key)
    setSaveState(state)
    if (state.dirty || state.error) return
    window.location.href = '/dashboard'
  }

  function handleRequestDeleteWorkout() {
    setShowLeaveSheet(false)
    setShowDeleteConfirm(true)
  }

  // Tile 1: the only path that actually destroys data — a second explicit
  // "Are you sure?" step, then the real delete action (already redirects to
  // the dashboard on success).
  function handleConfirmDeleteWorkout() {
    startTransition(async () => {
      await deleteWorkout(workout.id)
    })
  }

  // Tile 15: Back → Discard on an edited completed workout restores the
  // pre-edit snapshot (reverting every change made since, including ones
  // that already autosaved) and persists that restoration, instead of just
  // flipping isEditing off and leaving already-saved changes in place.
  function handleDiscardEdits() {
    setShowDiscardEditsPrompt(false)
    if (editSnapshot) {
      const restored = restoreSnapshot(editSnapshot)
      setLocalSets(restored)
      persist(restored)
    }
    setEditSnapshot(null)
    setIsEditing(false)
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
      difficulty: s.difficulty,
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
    persist(localSets)
  }

  function confirmSaveProgress() {
    setSavedOnce(true)
    setShowSaveWarning(false)
    persist(localSets)
  }

  // Completing is a distinct server action (not a saveWorkoutProgress
  // snapshot) but must obey the same contract: never overlap an in-flight
  // autosave for this workout (ADR-0004 §2), inspect the result, and on
  // failure surface it instead of the redirect the happy path gets — Done
  // must never navigate away while the final save has failed.
  //
  // D6: `idle()` alone isn't enough — a save that failed all its auto-
  // retries is idle-WITH-error, and a local-only edit (markDirty, no persist
  // call site) is idle-WITH-dirty. Either must block Complete: wait out any
  // in-flight/retrying save, then refuse unless the latest snapshot has
  // actually persisted clean. The save-state strip's Retry / next autosave
  // is what clears dirty/error and re-enables Done.
  function handleComplete() {
    startTransition(async () => {
      await saveQueueRef.current.idle(String(workout.id))
      const state = saveQueueRef.current.getState(String(workout.id))
      if (state.dirty || state.error) {
        setSaveState(state) // surface the notice/strip if it isn't already visible
        return
      }
      // Unlike persist(), this bypasses the queue's try/catch — a transport
      // failure REJECTS rather than returning {error}, and an unhandled
      // rejection here would be the silent Done-failure ADR-0004 forbids.
      try {
        const result = await completeWorkout(workout.id, buildPayload())
        if (result?.error) {
          setSaveState({ dirty: true, pending: false, error: result.error, retrying: false })
        }
      } catch (e) {
        setSaveState({
          dirty: true,
          pending: false,
          error: e instanceof Error ? e.message : String(e),
          retrying: false,
        })
      }
    })
  }

  // Tile 4/13: the one place that actually mutates localSets for paste/
  // import — Overwrite replaces, Append adds after what's already there.
  // Either way an armed delete-confirm's localId no longer resolves, so it's
  // cleared alongside.
  function applyIncomingSets(incoming: LocalSet[], mode: MergeMode) {
    setLocalSets((prev) => mergeIncomingSets(prev, incoming, mode))
    setPendingDeleteId(null)
    markDirty()
  }

  function handlePasteRequest() {
    if (!clipboard) return
    if (localSets.length > 0) {
      setPendingApply({ source: 'paste' })
    } else {
      applyIncomingSets(clipboardEntriesToLocalSets(clipboard.entries), 'overwrite')
    }
  }

  // Resolves whichever action (paste or import) is currently prompting the
  // user, for the chosen mode. Overwrite/Append both funnel through
  // applyIncomingSets so the merge rule is identical for either source.
  function resolvePendingApply(mode: MergeMode) {
    if (!pendingApply) return
    if (pendingApply.source === 'paste') {
      if (!clipboard) {
        setPendingApply(null)
        return
      }
      applyIncomingSets(clipboardEntriesToLocalSets(clipboard.entries), mode)
    } else {
      applyIncomingSets(expandTemplate(pendingApply.template.routine_exercises), mode)
    }
    setPendingApply(null)
  }

  // Tile 4: lossless, state-independent copy — every exercise, every set's
  // own weight/reps, in order. No flattening to "set #1 x count" (that's
  // what made 60x10/60x8/50x6 copy as "3 x 60x10").
  function handleCopy() {
    const entries = buildClipboardEntries(exerciseOrder, grouped)
    copyToClipboard({ entries, sourceDate: workout.date })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function moveExercise(exerciseId: number, direction: 'up' | 'down') {
    setLocalSets((prev) => reorderExercise(prev, exerciseId, direction))
    markDirty()
  }

  // ─── Add-set form (rendered inline or at bottom) ──────────────────────────

  function renderAddSetForm() {
    if (!selectedExercise) return null
    return (
      <div
        className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-3"
        // Tile 9: tapping fully away from the add form (focus leaves this
        // container, e.g. Back/Save/scrolling to another set) flushes typed
        // values as a not-done set. Switching exercises (quick-add +, the
        // "change" button below) is handled explicitly in
        // handleSelectExercise so it doesn't depend on focus/blur ordering.
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            autoCommitAddForm()
          }
        }}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Adding set</p>
          <button
            onClick={() => { autoCommitAddForm(); setShowPicker(true) }}
            className="text-xs font-bold text-orange-500 hover:text-orange-600 transition-colors"
          >
            change
          </button>
        </div>
        <div className="flex items-center gap-1 min-w-0">
          <p className="flex-1 min-w-0 truncate text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wide">
            {selectedExercise.name}
          </p>
          <IconHitTarget onClick={() => handleInfoClick(selectedExercise.id)} title="Exercise info">
            <span className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none">
              i
            </span>
          </IconHitTarget>
          <IconHitTarget onClick={() => handlePerfClick(selectedExercise.id, selectedExercise.name, 'last', selectedExercise.category)} title="Last session">
            <span className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="6" cy="6" r="5" /><path d="M6 3v3l1.5 1.5" />
              </svg>
            </span>
          </IconHitTarget>
          <IconHitTarget onClick={() => handlePerfClick(selectedExercise.id, selectedExercise.name, 'best', selectedExercise.category)} title="Best session">
            <span className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3.5 1.5h5v3.5a2.5 2.5 0 0 1-5 0V1.5z" /><path d="M6 7v1.5" /><path d="M4 9h4" /><path d="M1.5 2.5h2" /><path d="M8.5 2.5h2" />
              </svg>
            </span>
          </IconHitTarget>
          <IconHitTarget onClick={() => handlePerfClick(selectedExercise.id, selectedExercise.name, 'best60', selectedExercise.category)} title="Best · 60 days">
            <span className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 1.5L3.5 6.5H6.5L5 10.5" />
              </svg>
            </span>
          </IconHitTarget>
        </div>
        {selectedExercise?.category === 'cardio' ? (
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              placeholder="Min"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSet()}
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm outline-none focus:border-orange-400 transition-colors"
            />
            <input
              type="number"
              inputMode="decimal"
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
              decimal
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

  // WP-12: distance is always stored in km (ADR-0003); this is the single
  // render-time conversion+format used by every set-row display site so
  // km/m stays consistent everywhere (§19.10/§19.11). null -> null, so
  // callers keep rendering their own "—" placeholder unchanged.
  const distanceLabel = (storedKm: number | null) => formatDistance(convertKmTo(storedKm, distanceUnit), distanceUnit)
  // Only surface the km/m toggle when it's relevant — no point cluttering
  // the header for a workout with no cardio exercises.
  const hasCardioSets = localSets.some((s) => s.exerciseCategory === 'cardio')

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
            {hasCardioSets && (
              <button
                onClick={() => setDistanceUnit((u) => (u === 'km' ? 'm' : 'km'))}
                title="Toggle distance unit"
                aria-label={`Distance unit: ${distanceUnit}. Tap to switch to ${distanceUnit === 'km' ? 'm' : 'km'}`}
                className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
              >
                {distanceUnit}
              </button>
            )}
            <button
              onClick={handleCopy}
              disabled={localSets.length === 0}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 disabled:opacity-40 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => { setEditSnapshot(restoreSnapshot(localSets)); setIsEditing(true) }}
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
                  onClick={() => handlePerfClick(exerciseId, group.name, 'last', group.sets[0]?.exerciseCategory ?? null)}
                  title="Last session"
                  className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="6" cy="6" r="5" />
                    <path d="M6 3v3l1.5 1.5" />
                  </svg>
                </button>
                <button
                  onClick={() => handlePerfClick(exerciseId, group.name, 'best', group.sets[0]?.exerciseCategory ?? null)}
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
                  onClick={() => handlePerfClick(exerciseId, group.name, 'best60', group.sets[0]?.exerciseCategory ?? null)}
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
                    className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3"
                  >
                    <div className="grid grid-cols-[2rem_1fr_1fr] items-center gap-3">
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
                              {distanceLabel(s.distance) ?? '—'}
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
                    {s.exerciseCategory !== 'cardio' && (
                      <div className="mt-1.5 pl-[2rem]">
                        <DifficultyChip value={s.difficulty} />
                      </div>
                    )}
                    {formatRestRow(s.rest_seconds) && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1.5 pl-[2rem]">{formatRestRow(s.rest_seconds)}</p>
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
            distanceUnit={distanceUnit}
            exerciseName={perfModal.name}
            category={perfModal.category}
            title={PERF_TITLE[perfModal.mode]}
            data={perfData}
            loading={perfLoading}
            onClose={() => setPerfModal(null)}
          />
        )}
      </div>
    )
  }

  // Resolved rest target for the sticky RestTimer (Tile 6 / D4): the set
  // `restForSet` belongs to determines which exercise's prescription (if any)
  // applies; falls back to the global stepper when there's no set, exercise,
  // or prescription.
  const restForSetExerciseId = localSets.find((s) => s.localId === restForSet)?.exerciseId
  const activeRestTarget = resolveRestTarget(
    restForSetExerciseId != null ? ptRest[restForSetExerciseId] : undefined,
    restTarget,
  )

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
          <p className="text-xs font-bold uppercase tracking-widest text-orange-500">
            {workout.status === 'completed' && isEditing ? 'Editing' : 'Active'}
          </p>
          <h1 className="text-sm font-bold text-zinc-900 dark:text-white">{dateLabel}</h1>
        </div>
        <div className="flex items-center gap-2">
          {hasCardioSets && (
            <button
              onClick={() => setDistanceUnit((u) => (u === 'km' ? 'm' : 'km'))}
              title="Toggle distance unit"
              aria-label={`Distance unit: ${distanceUnit}. Tap to switch to ${distanceUnit === 'km' ? 'm' : 'km'}`}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
            >
              {distanceUnit}
            </button>
          )}
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
            // D6: Done must not fire over unsaved data — block while a save
            // is in flight/retrying, dirty (unsaved local edit), or has
            // failed all its retries. handleComplete re-checks this after
            // idle() too, so this is belt-and-suspenders against a stale
            // disabled prop, not the sole guard.
            disabled={isPending || saveState.pending || saveState.dirty || !!saveState.error}
            title={saveState.error ? 'Fix the save error before completing' : saveState.dirty ? 'Waiting for changes to save' : undefined}
            className="rounded-full bg-orange-500 hover:bg-orange-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-40 transition-colors"
          >
            {isPending ? '…' : 'Done'}
          </button>
        </div>
      </header>

      {/* ADR-0004: aria-live "not saved" state. Announces failures immediately
          (assertive) and clears silently on success — never a silent-failure
          path (finding C2). Retry re-runs the exact same snapshot save.
          D6: a failed autosave auto-retries (bounded, jittered backoff) with
          no user action; `saveState.error` only becomes truthy once that
          retry budget is exhausted, which is when this becomes a PERSISTENT
          notice (not a transient toast) with a manual Retry — the
          beforeunload guard (:260ish) stays armed the whole time via
          dirty/pending/error. */}
      <div aria-live="assertive" className="sr-only">
        {saveState.error ? `Not saved: ${saveState.error}` : saveState.retrying ? 'Retrying save…' : ''}
      </div>
      {saveState.error && (
        <div className="flex items-center justify-between gap-3 px-6 py-2 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 text-red-700 dark:text-red-300">
          <p className="text-xs font-bold">Couldn&apos;t save yet — {saveState.error}</p>
          <button
            onClick={() => persist(localSets)}
            className="rounded-full border border-red-300 dark:border-red-800 px-3 py-1 text-xs font-bold uppercase tracking-wide hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
      {!saveState.error && saveState.retrying && (
        <div className="px-6 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900">
          Retrying save…
        </div>
      )}
      {!saveState.error && !saveState.retrying && saveState.dirty && (
        <div className="px-6 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          Unsaved changes
        </div>
      )}

      <main className="max-w-lg mx-auto px-6 py-6 flex flex-col gap-6">

        {/* Rest — sticky at top; see shouldStickRestBar (finding L2, commit
            91d70ae) for when it drops out of sticky vs. stays pinned. */}
        <div className={`${shouldStickRestBar(fieldFocused, restForSet !== null) ? 'sticky top-0' : ''} z-20 -mx-6 px-6 py-2 bg-zinc-50/95 dark:bg-black/95 backdrop-blur border-b border-zinc-200/60 dark:border-zinc-800/60`}>
          {restForSet !== null ? (
            <div className="flex flex-col gap-1.5">
              <RestTimer
                key={`${restForSet}:${restNonce}`}
                initialMode={restMode}
                initialTarget={activeRestTarget}
                onDone={finishRest}
                onSettingsChange={(m, t) => { setRestMode(m); setRestTarget(t) }}
              />
              {/* The ONE deliberate restart, even while a rest is already running
                  (D5/Tile 6): logs the current elapsed to its set, then starts a
                  fresh 0:00 timer. Every other completion path is idle-gated and
                  leaves a running rest untouched. */}
              {localSets.length > 0 && (
                <button
                  onClick={() => forceRestartRestFor(localSets[localSets.length - 1].localId)}
                  className="self-end rounded-full bg-orange-500 hover:bg-orange-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition-colors"
                >
                  Start rest
                </button>
              )}
            </div>
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
            {/* Row 1: title + info/history icon buttons (44px hit areas, ADR-0008) */}
            <div className="flex items-center gap-1 min-w-0">
              <h2 className="flex-1 min-w-0 text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wide truncate">{group.name}</h2>
              <IconHitTarget onClick={() => handleInfoClick(exerciseId)} title="Exercise info">
                <span className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none">
                  i
                </span>
              </IconHitTarget>
              <IconHitTarget onClick={() => handlePerfClick(exerciseId, group.name, 'last', group.sets[0]?.exerciseCategory ?? null)} title="Last session">
                <span className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="6" cy="6" r="5" />
                    <path d="M6 3v3l1.5 1.5" />
                  </svg>
                </span>
              </IconHitTarget>
              <IconHitTarget onClick={() => handlePerfClick(exerciseId, group.name, 'best', group.sets[0]?.exerciseCategory ?? null)} title="Best session">
                <span className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3.5 1.5h5v3.5a2.5 2.5 0 0 1-5 0V1.5z" />
                    <path d="M6 7v1.5" />
                    <path d="M4 9h4" />
                    <path d="M1.5 2.5h2" />
                    <path d="M8.5 2.5h2" />
                  </svg>
                </span>
              </IconHitTarget>
              <IconHitTarget onClick={() => handlePerfClick(exerciseId, group.name, 'best60', group.sets[0]?.exerciseCategory ?? null)} title="Best · 60 days">
                <span className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M7 1.5L3.5 6.5H6.5L5 10.5" />
                  </svg>
                </span>
              </IconHitTarget>
            </div>

            {/* Row 2: reorder + guide-all + quick-add — own row so 44px targets fit on a 360px viewport */}
            <div className="flex items-center justify-end gap-1">
              {exerciseOrder.length > 1 && (
                <>
                  <IconHitTarget onClick={() => moveExercise(exerciseId, 'up')} disabled={exIdx === 0} title="Move exercise up">
                    <span className="flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-base leading-none">↑</span>
                  </IconHitTarget>
                  <IconHitTarget onClick={() => moveExercise(exerciseId, 'down')} disabled={exIdx === exerciseOrder.length - 1} title="Move exercise down">
                    <span className="flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-base leading-none">↓</span>
                  </IconHitTarget>
                </>
              )}
              <button
                onClick={() => openGuideSetup(exerciseId)}
                title="Guide whole exercise (all sets, with rests)"
                className="flex items-center gap-1 h-8 px-2.5 rounded-full border border-orange-400 text-orange-500 hover:bg-orange-500 hover:text-white transition-colors text-xs font-bold leading-none"
              >
                ▶ All
              </button>
              <IconHitTarget
                onClick={() => {
                  const ex = exercises.find((e) => e.id === exerciseId)
                  if (ex) handleSelectExercise(ex)
                }}
                title="Quick-add a set"
              >
                <span className="flex items-center justify-center h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-orange-500 hover:text-white transition-colors text-lg leading-none">
                  +
                </span>
              </IconHitTarget>
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
                    className="flex flex-col gap-2 rounded-xl bg-white dark:bg-zinc-900 border-2 border-orange-400 px-4 py-3"
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        saveEditSet(s.localId)
                      }
                    }}
                  >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-orange-400 w-8 shrink-0">#{i + 1}</span>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      {s.exerciseCategory === 'cardio' ? (
                        <>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">Duration (min)</span>
                            <input
                              type="number"
                              inputMode="numeric"
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
                              inputMode="decimal"
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
                            decimal
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
                  {s.exerciseCategory !== 'cardio' && (
                    <div className="pl-11">
                      <DifficultyChip value={s.difficulty} onSelect={(n) => handleSetDifficulty(s.localId, n)} />
                    </div>
                  )}
                  </div>
                ) : (
                  <div key={s.localId} className="flex flex-col gap-1.5">
                    <div
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
                              {distanceLabel(s.distance) ?? '—'}
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
                      <div className="flex items-center gap-0.5 justify-end">
                        {!s.done && s.exerciseCategory !== 'cardio' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openGuidedSetupForSet(s) }}
                            title="Guided set (adjust tempo, reps, weight)"
                            className="shrink-0 rounded-md border border-orange-400 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/20 px-2 py-1 text-xs font-bold transition-colors leading-none"
                          >
                            ▶
                          </button>
                        )}
                        <IconHitTarget
                          onClick={(e) => { e.stopPropagation(); handleDeleteTap(s.localId) }}
                          title="Delete set"
                        >
                          <span className="text-zinc-300 hover:text-red-500 dark:text-zinc-700 dark:hover:text-red-500 transition-colors">✕</span>
                        </IconHitTarget>
                      </div>
                    </div>
                    {s.exerciseCategory !== 'cardio' && (
                      <div className="pl-8">
                        <DifficultyChip value={s.difficulty} onSelect={(n) => handleSetDifficulty(s.localId, n)} />
                      </div>
                    )}
                    {formatRestRow(s.rest_seconds) && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-600 pl-8">{formatRestRow(s.rest_seconds)}</p>
                    )}
                    {/* ADR-0008 (WP-09): two-tap confirm, mirrors the calendar's Confirm/Cancel (§3.15-3.17) */}
                    {pendingDeleteId === s.localId && (
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDeleteTap(s.localId)}
                          className="flex-1 min-h-11 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-bold uppercase tracking-wide text-white transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={cancelDeleteTap}
                          className="flex-1 min-h-11 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
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
            distanceUnit={distanceUnit}
          exerciseName={perfModal.name}
          category={perfModal.category}
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
        <Modal
          title="Load template"
          onClose={() => setShowImportPicker(false)}
          backdropClassName="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
          panelClassName="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl max-h-[75vh] flex flex-col shadow-2xl outline-none"
        >
          <>
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
          </>
        </Modal>
      )}

      {/* Save progress warning */}
      {showSaveWarning && (
        <Modal
          title="Progress won't be tracked"
          onClose={() => setShowSaveWarning(false)}
          destructive
          backdropClassName="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4"
          panelClassName="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl outline-none"
        >
          <>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-1">Heads up</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Progress won&apos;t be tracked</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Sets are saved but this workout won&apos;t count toward exercise history. Hit <strong>Done</strong> when you finish to track your progress.
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
          </>
        </Modal>
      )}

      {/* Tile 4/13: shared Overwrite/Append/cancel prompt for both Paste and
          Import into a non-empty workout — wiping is never the silent default. */}
      {pendingApply && (
        <Modal
          title="Add to current sets?"
          onClose={() => setPendingApply(null)}
          destructive
          backdropClassName="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4"
          panelClassName="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl outline-none"
        >
          <>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-1">
                {pendingApply.source === 'paste' ? 'Paste' : 'Load template'}
              </p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Add to current sets?</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                This workout already has sets. Append keeps them and adds the{' '}
                {pendingApply.source === 'paste' ? 'copied' : 'template'} sets after; Overwrite replaces
                everything.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingApply(null)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => resolvePendingApply('append')}
                className="flex-1 rounded-xl border border-orange-400 text-orange-500 py-2.5 text-sm font-bold hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
              >
                Append
              </button>
              <button
                onClick={() => resolvePendingApply('overwrite')}
                className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 py-2.5 text-sm font-bold text-white transition-colors"
              >
                Overwrite
              </button>
            </div>
          </>
        </Modal>
      )}

      {/* Discard edits prompt (editing a completed workout) */}
      {showDiscardEditsPrompt && (
        <Modal
          title="Discard changes?"
          onClose={() => setShowDiscardEditsPrompt(false)}
          destructive
          backdropClassName="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4"
          panelClassName="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl outline-none"
        >
          <>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-red-500 mb-1">Warning</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Discard changes?</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                This restores the workout to how it looked before you started editing —
                any changes made since, including ones already saved, are reverted.
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
                onClick={handleDiscardEdits}
                className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 py-2.5 text-sm font-bold text-white transition-colors"
              >
                Discard
              </button>
            </div>
          </>
        </Modal>
      )}

      {/* Tile 1: Back on an active workout — Save & leave / Delete workout.
          Leaving always saves; nothing here implies data is lost by
          navigating away. Delete is a distinct, separate confirm step. */}
      {showLeaveSheet && (
        <Modal
          title="Leave workout?"
          onClose={() => setShowLeaveSheet(false)}
          backdropClassName="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4"
          panelClassName="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl outline-none"
        >
          <>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Leave workout?</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Your progress stays saved and in progress unless you delete it.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSaveAndLeave}
                className="w-full rounded-xl bg-orange-500 hover:bg-orange-600 py-2.5 text-sm font-bold text-white transition-colors"
              >
                Save &amp; leave
              </button>
              <button
                onClick={handleRequestDeleteWorkout}
                className="w-full rounded-xl border border-red-500 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 py-2.5 text-sm font-bold transition-colors"
              >
                Delete workout
              </button>
              <button
                onClick={() => setShowLeaveSheet(false)}
                className="w-full py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        </Modal>
      )}

      {/* Tile 1: second, explicit confirm — the only path that actually
          destroys the workout. */}
      {showDeleteConfirm && (
        <Modal
          title="Delete this workout?"
          onClose={() => setShowDeleteConfirm(false)}
          destructive
          backdropClassName="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4"
          panelClassName="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl outline-none"
        >
          <>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-red-500 mb-1">Are you sure?</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Delete this workout?</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                This permanently removes the workout and every logged set. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteWorkout}
                disabled={isPending}
                className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-40 transition-colors"
              >
                {isPending ? '…' : 'Delete'}
              </button>
            </div>
          </>
        </Modal>
      )}

      {/* Guided-set tempo setup */}
      {guidedSetup && (
        <Modal
          title={`Guided set: ${guidedSetup.exercise.name}`}
          onClose={() => setGuidedSetup(null)}
          backdropClassName="fixed inset-0 bg-black/70 flex items-center justify-center z-[75] px-4"
          panelClassName="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl outline-none"
        >
          <>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-1">Guided set</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white truncate">{guidedSetup.exercise.name}</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Stepper
                label="Weight (kg)"
                value={Number(guidedSetup.weight) || 0}
                min={0}
                max={500}
                decimal
                onChange={(v) => setGuidedSetup((g) => (g ? { ...g, weight: v > 0 ? String(v) : '' } : g))}
              />
              <Stepper
                label="Goal reps"
                value={Number(guidedSetup.goalReps) || 0}
                min={1}
                max={50}
                onChange={(v) => setGuidedSetup((g) => (g ? { ...g, goalReps: String(v) } : g))}
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
          </>
        </Modal>
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
        <Modal
          title={`Note: ${editingNote.name}`}
          onClose={() => setEditingNote(null)}
          backdropClassName="fixed inset-0 bg-black/70 flex items-center justify-center z-[75] px-4"
          panelClassName="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl outline-none"
        >
          <>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-1">Note</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white truncate">{editingNote.name}</h3>
            </div>
            <textarea
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
          </>
        </Modal>
      )}

      {/* Whole-exercise guide SETUP */}
      {guideSetup && (
        <Modal
          title={`Guide exercise: ${guideSetup.exerciseName}`}
          onClose={() => setGuideSetup(null)}
          backdropClassName="fixed inset-0 bg-black/70 flex items-center justify-center z-[75] px-4"
          panelClassName="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl max-h-[85vh] overflow-y-auto outline-none"
        >
          <>
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
                  <Stepper label="Weight" sublabel="kg" value={r.weight} min={0} max={500} decimal onChange={(v) => updateGuideRow(r.localId, { weight: v })} />
                  <Stepper label="Reps" value={r.reps} min={1} max={50} onChange={(v) => updateGuideRow(r.localId, { reps: v })} />
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
          </>
        </Modal>
      )}

      {/* Whole-exercise guide (set → rest → set …) */}
      {guidingExerciseId != null && (
        <ExerciseGuide
          exerciseName={grouped[guidingExerciseId]?.name ?? ''}
          tempo={tempo}
          sets={guideSetsFor(guidingExerciseId)}
          restSeconds={resolveRestTarget(ptRest[guidingExerciseId], restTarget)}
          onDone={handleGuideDone}
        />
      )}

      {/* Tile 12: batched end-of-guide rep review — one editable review of
          every completed set's reps before anything is written back. */}
      {guideReview && (
        <Modal
          title={`Review: ${guideReview.exerciseName}`}
          onClose={() => setGuideReview(null)}
          backdropClassName="fixed inset-0 bg-black/70 flex items-center justify-center z-[75] px-4"
          panelClassName="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl max-h-[85vh] overflow-y-auto outline-none"
        >
          <>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-1">Confirm reps</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white truncate">{guideReview.exerciseName}</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Adjust any set before logging — 0 reps leaves that set pending (not logged).
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {guideReview.results.map((r, i) => (
                <div key={r.localId} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-zinc-400 w-16 shrink-0">
                    Set {i + 1}{r.weight ? ` · ${r.weight}kg` : ''}
                  </span>
                  <Stepper
                    label="Reps"
                    sublabel={`goal ${r.goalReps}`}
                    value={r.reps}
                    min={0}
                    max={Math.max(r.goalReps, r.reps, 50)}
                    onChange={(v) => updateGuideReviewReps(r.localId, v)}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={commitGuideReview}
              className="w-full rounded-xl bg-orange-500 hover:bg-orange-600 py-2.5 text-sm font-bold text-white transition-colors"
            >
              Log these sets
            </button>
          </>
        </Modal>
      )}
    </div>
  )
}
