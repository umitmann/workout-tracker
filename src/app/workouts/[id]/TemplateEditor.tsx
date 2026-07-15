'use client'

import { useEffect, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createTemplate, saveTemplateExercises, deleteTemplate, TemplateExercisePayload } from '@/app/actions/templates'
import { readDistanceUnitPref } from '@/lib/distanceUnit'
import { startWorkoutFromTemplate, startPlannedWorkout, scheduleWorkout } from '@/app/actions/workouts'
import { fetchExerciseDetails, fetchLastExercisePerformance, fetchBestExercisePerformance, fetchBestExercisePerformance60Days } from '@/app/actions/exercises'
import type { LastExercisePerformance, RoutineWithExercises, SetDetail } from '@/lib/dal'
import ExercisePickerSheet, { SlimExercise } from '@/app/workout/[id]/ExercisePickerSheet'
import ExerciseInfoModal from '@/app/workout/[id]/ExerciseInfoModal'
import Modal from '@/components/Modal'
import LastPerfModal from '@/app/workout/[id]/LastPerfModal'
import Stepper from '@/app/workout/[id]/Stepper'
import { TempoConfig, parseTempo, formatTempo } from '@/lib/tempo'
import { useWorkoutClipboard } from '@/lib/WorkoutClipboardContext'
import { clipboardEntryToTemplateFields } from '@/lib/clipboardOps'
import { localDateStr } from '@/lib/localDate'
import {
  isDesktopGeneratorEligible,
  resolveWorkoutGeneratorMode,
  type WorkoutGeneratorMode,
} from '@/lib/desktopGeneratorMode'
import MobileMusclePlanner from './MobileMusclePlanner'

const DesktopWorkoutGenerator = dynamic(() => import('./DesktopWorkoutGenerator'), {
  ssr: false,
  loading: () => (
    <div className="mx-auto grid min-h-[720px] w-full max-w-[1800px] place-items-center px-6 text-sm font-semibold text-zinc-500">
      Loading 3D workout generator…
    </div>
  ),
})

export type TemplateExercise = {
  localId: string
  exerciseId: number
  exerciseName: string
  exerciseCategory: string | null
  sets: number
  reps: number | null
  weight: number | null
  duration_minutes: number | null
  distance: number | null
  setDetails: SetDetail[] | null // per-set targets (dropset/pyramid); null = uniform
  tempo: TempoConfig | null // PT-prescribed DRUH tempo; null = none
  restSeconds: number | null // PT-prescribed rest target (seconds); null = use the athlete's global stepper
}

export type TemplateExerciseUpdate = Partial<
  Pick<TemplateExercise, 'sets' | 'reps' | 'weight' | 'duration_minutes' | 'distance'>
>

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

export default function TemplateEditor({
  exercises,
  template,
  date,
  workoutId,
}: {
  exercises: SlimExercise[]
  template?: RoutineWithExercises
  date?: string
  workoutId?: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { clipboard, copy: copyToClipboard } = useWorkoutClipboard()
  const [copied, setCopied] = useState(false)
  const [showPasteConfirm, setShowPasteConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [generatorMode, setGeneratorMode] = useState<WorkoutGeneratorMode>('classic')
  const [desktopEligible, setDesktopEligible] = useState(false)
  const [showMobileMusclePlanner, setShowMobileMusclePlanner] = useState(false)

  const today = localDateStr()
  const isScheduling = !!date && date > today

  const [name, setName] = useState(template?.name ?? '')
  const [items, setItems] = useState<TemplateExercise[]>(
    () =>
      template?.routine_exercises
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((e) => ({
          localId: crypto.randomUUID(),
          exerciseId: e.exercise_id,
          exerciseName: e.exercises?.name ?? String(e.exercise_id),
          exerciseCategory: e.exercises?.category ?? null,
          sets: e.sets ?? 3,
          reps: e.reps ?? null,
          weight: e.weight,
          duration_minutes: e.duration_minutes ?? null,
          distance: e.distance ?? null,
          setDetails: e.set_details ?? null,
          tempo: e.tempo ? parseTempo(e.tempo) : null,
          restSeconds: e.rest_seconds ?? null,
        })) ?? [],
  )

  const [showPicker, setShowPicker] = useState(false)
  const [pickerActiveMuscles, setPickerActiveMuscles] = useState<string[]>([])
  const [pickerActiveCategories, setPickerActiveCategories] = useState<string[]>([])
  const [infoExercise, setInfoExercise] = useState<ExerciseDetails | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  type PerfMode = 'last' | 'best' | 'best60'
  const PERF_TITLE: Record<PerfMode, string> = { last: 'Last session', best: 'Best session', best60: 'Best · 60 days' }
  const [perfModal, setPerfModal] = useState<{ id: number; name: string; mode: PerfMode; category: string | null } | null>(null)
  const [perfData, setPerfData] = useState<LastExercisePerformance | null>(null)
  const [perfLoading, setPerfLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function syncDesktopEligibility() {
      const eligible = isDesktopGeneratorEligible(window.innerWidth)
      setDesktopEligible(eligible)
      if (!eligible) setGeneratorMode('classic')
    }
    syncDesktopEligibility()
    window.addEventListener('resize', syncDesktopEligibility)
    return () => window.removeEventListener('resize', syncDesktopEligibility)
  }, [])

  function toggleGeneratorMode() {
    if (generatorMode === 'desktop') {
      setGeneratorMode('classic')
      return
    }
    setGeneratorMode(resolveWorkoutGeneratorMode('desktop', window.innerWidth))
  }

  function handleAddExercise(ex: SlimExercise) {
    const isCardio = ex.category === 'cardio'
    setItems((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        exerciseId: ex.id,
        exerciseName: ex.name,
        exerciseCategory: ex.category,
        sets: 3,
        reps: isCardio ? null : 10,
        weight: null,
        duration_minutes: isCardio ? 30 : null,
        distance: null,
        setDetails: null,
        tempo: null,
        restSeconds: null,
      },
    ])
    setShowPicker(false)
  }

  function toggleTempo(localId: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.localId === localId
          ? { ...i, tempo: i.tempo ? null : { down: 3, rest: 1, up: 2, hold: 1 } }
          : i,
      ),
    )
  }

  function updateTempo(localId: string, phase: keyof TempoConfig, v: number) {
    setItems((prev) =>
      prev.map((i) => (i.localId === localId && i.tempo ? { ...i, tempo: { ...i.tempo, [phase]: v } } : i)),
    )
  }

  // PT-prescribed rest target per exercise (Tile 6 / D4). Toggling on seeds a
  // sensible default; toggling off clears it back to null so the athlete's
  // global stepper applies again.
  function toggleRestTarget(localId: string) {
    setItems((prev) =>
      prev.map((i) => (i.localId === localId ? { ...i, restSeconds: i.restSeconds != null ? null : 90 } : i)),
    )
  }

  function updateRestTarget(localId: string, v: number) {
    setItems((prev) =>
      prev.map((i) => (i.localId === localId && i.restSeconds != null ? { ...i, restSeconds: Math.max(0, v) } : i)),
    )
  }

  // ── Per-set / dropset editing ──────────────────────────────────────────────

  function toggleDropset(localId: string) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.localId !== localId) return i
        if (i.setDetails) return { ...i, setDetails: null } // back to uniform
        // Seed per-set rows from the current uniform target
        const rows: SetDetail[] = Array.from({ length: Math.max(1, i.sets) }, () => ({
          reps: i.reps,
          weight: i.weight,
        }))
        return { ...i, setDetails: rows }
      }),
    )
  }

  function updateSetDetail(localId: string, idx: number, patch: Partial<SetDetail>) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.localId !== localId || !i.setDetails) return i
        const next = i.setDetails.map((d, j) => (j === idx ? { ...d, ...patch } : d))
        return { ...i, setDetails: next, sets: next.length }
      }),
    )
  }

  function addSetDetail(localId: string) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.localId !== localId || !i.setDetails) return i
        const last = i.setDetails[i.setDetails.length - 1] ?? { reps: i.reps, weight: i.weight }
        const next = [...i.setDetails, { ...last }]
        return { ...i, setDetails: next, sets: next.length }
      }),
    )
  }

  function removeSetDetail(localId: string, idx: number) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.localId !== localId || !i.setDetails) return i
        const next = i.setDetails.filter((_, j) => j !== idx)
        if (next.length === 0) return { ...i, setDetails: null } // no rows → uniform
        return { ...i, setDetails: next, sets: next.length }
      }),
    )
  }

  function handleRemove(localId: string) {
    setItems((prev) => prev.filter((i) => i.localId !== localId))
  }

  function moveItem(localId: string, direction: 'up' | 'down') {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.localId === localId)
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next
    })
  }

  function updateItem(localId: string, patch: TemplateExerciseUpdate) {
    setItems((prev) => prev.map((i) => (i.localId === localId ? { ...i, ...patch } : i)))
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
    else data = await fetchBestExercisePerformance60Days(exerciseId, today)
    setPerfData(data)
    setPerfLoading(false)
  }

  function handleCopy() {
    copyToClipboard({
      // Tile 4: lossless per-set copy — per-set targets (dropset/pyramid)
      // copy set-for-set; a uniform item expands to `sets` identical rows
      // (its own weight/reps are the same for every set anyway).
      entries: items.map((item) => ({
        exerciseId: item.exerciseId,
        exerciseName: item.exerciseName,
        setMode: item.setDetails ? 'per_set' : 'uniform',
        sets:
          item.setDetails ??
          Array.from({ length: item.sets }, () => ({ weight: item.weight, reps: item.reps })),
      })),
      sourceDate: today,
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handlePasteRequest() {
    if (items.length > 0) {
      setShowPasteConfirm(true)
    } else {
      applyPaste()
    }
  }

  function applyPaste() {
    if (!clipboard) return
    setItems(
      clipboard.entries.map((entry) => {
        const prescription = clipboardEntryToTemplateFields(entry)
        return {
          localId: crypto.randomUUID(),
          exerciseId: entry.exerciseId,
          exerciseName: entry.exerciseName,
          exerciseCategory: null,
          sets: prescription.sets,
          reps: prescription.reps,
          weight: prescription.weight,
          duration_minutes: null,
          distance: null,
          setDetails: prescription.setDetails,
          tempo: null,
          restSeconds: null,
        }
      }),
    )
    setShowPasteConfirm(false)
  }

  function buildPayload(): TemplateExercisePayload[] {
    return items.map((item, i) => ({
      exerciseId: item.exerciseId,
      // When per-set targets exist, keep sets/reps/weight in sync with the first
      // row so non-migrated readers still get a sensible uniform fallback.
      sets: item.setDetails ? item.setDetails.length : item.sets,
      reps: item.setDetails ? item.setDetails[0]?.reps ?? null : item.reps,
      weight: item.setDetails ? item.setDetails[0]?.weight ?? null : item.weight,
      duration_minutes: item.duration_minutes,
      distance: item.distance,
      set_details: item.setDetails,
      tempo: item.tempo ? formatTempo(item.tempo) : null,
      rest_seconds: item.restSeconds,
      order: i,
    }))
  }

  function handleSave() {
    if (!name.trim()) { setError('Give your workout a name'); return }
    setError(null)

    const payload = buildPayload()

    startTransition(async () => {
      if (template) {
        const result = await saveTemplateExercises(template.id, name.trim(), payload)
        if ('error' in result) { setError(result.error ?? 'Save failed'); return }
      } else {
        const created = await createTemplate(name.trim())
        if ('error' in created) { setError(created.error ?? 'Create failed'); return }
        const saved = await saveTemplateExercises(created.id, name.trim(), payload)
        if ('error' in saved) { setError(saved.error ?? 'Save failed'); return }
      }
      router.push('/workouts')
    })
  }

  function handleStartNow() {
    if (!name.trim()) { setError('Give your workout a name'); return }
    setError(null)

    const payload = buildPayload()

    startTransition(async () => {
      let routineId: string
      if (template) {
        const result = await saveTemplateExercises(template.id, name.trim(), payload)
        if ('error' in result) { setError(result.error ?? 'Save failed'); return }
        routineId = template.id
      } else {
        const created = await createTemplate(name.trim())
        if ('error' in created) { setError(created.error ?? 'Create failed'); return }
        const saved = await saveTemplateExercises(created.id, name.trim(), payload)
        if ('error' in saved) { setError(saved.error ?? 'Save failed'); return }
        routineId = created.id
      }
      if (workoutId) {
        await startPlannedWorkout(workoutId)
      } else if (isScheduling) {
        const result = await scheduleWorkout(date!, String(routineId))
        if ('error' in result) { setError(result.error ?? 'Schedule failed'); return }
        router.push('/workouts')
      } else {
        // date is undefined when editing/creating a template outside the
        // "start for a specific calendar day" flow (e.g. /workouts/new) —
        // ADR-0005: the client always supplies its own local day explicitly,
        // never relying on a server-side "today".
        await startWorkoutFromTemplate(routineId, date ?? today)
      }
    })
  }

  function handleDelete() {
    if (!template) return
    setShowDeleteConfirm(true)
  }

  function handleConfirmDelete() {
    if (!template) return
    startTransition(async () => {
      const result = await deleteTemplate(template.id)
      if ('error' in result) {
        setError(result.error ?? 'Delete failed')
        return
      }
      router.push('/workouts')
      router.refresh()
    })
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-y-3 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => router.push('/workouts')}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          ← Workouts
        </button>
        <h1 className="min-w-0 text-sm font-medium text-zinc-900 dark:text-white">
          {template ? 'Edit template' : 'New template'}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggleGeneratorMode}
            disabled={!desktopEligible}
            aria-pressed={generatorMode === 'desktop'}
            className="hidden lg:inline-flex rounded-full border border-orange-400 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-orange-600 transition-colors hover:bg-orange-50 disabled:opacity-40 dark:text-orange-400 dark:hover:bg-orange-950/20"
          >
            {generatorMode === 'desktop' ? 'Use classic editor' : 'Open 3D generator'}
          </button>
          {items.length > 0 && (
            <button
              onClick={handleCopy}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
          {clipboard && (
            <button
              onClick={handlePasteRequest}
              className="rounded-full border border-orange-400 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors"
            >
              Paste
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isPending}
            className="rounded-full bg-zinc-800 dark:bg-zinc-700 hover:bg-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-40 transition-colors"
          >
            {isPending ? '…' : 'Save'}
          </button>
        </div>
      </header>

      {generatorMode === 'desktop' && desktopEligible ? (
        <DesktopWorkoutGenerator
          exercises={exercises}
          items={items}
          name={name}
          error={error}
          isPending={isPending}
          actionLabel={isScheduling ? 'Schedule' : 'Start now'}
          onNameChange={setName}
          onAddExercise={handleAddExercise}
          onRemoveExercise={handleRemove}
          onMoveExercise={moveItem}
          onUpdateExercise={updateItem}
          onSave={handleSave}
          onStart={handleStartNow}
          onUseClassic={() => setGeneratorMode('classic')}
        />
      ) : (
      <main className="max-w-lg mx-auto px-6 py-6 flex flex-col gap-6">
        {/* Name */}
        <input
          type="text"
          placeholder="Workout name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm font-medium outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
        />

        <button
          type="button"
          onClick={() => setShowMobileMusclePlanner(true)}
          className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-orange-300 bg-gradient-to-r from-orange-50 to-white px-4 text-left text-orange-950 shadow-sm transition active:scale-[0.99] dark:border-orange-900 dark:from-orange-950/30 dark:to-zinc-900 dark:text-orange-100 lg:hidden"
        >
          <span>
            <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">Anatomy planner</span>
            <span className="block text-sm font-bold">Choose muscles and see your load</span>
          </span>
          <span className="text-xl" aria-hidden="true">→</span>
        </button>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Exercise list */}
        {items.length === 0 && (
          <p className="text-sm text-zinc-400 dark:text-zinc-600">
            No exercises yet. Add one below.
          </p>
        )}

        {items.map((item, itemIdx) => (
          <div
            key={item.localId}
            className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{item.exerciseName}</p>
                  {item.exerciseCategory && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-0.5 capitalize">{item.exerciseCategory}</p>
                  )}
                </div>
                <button
                  onClick={() => handleInfoClick(item.exerciseId)}
                  title="Exercise info"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-600 dark:hover:border-zinc-400 dark:hover:text-zinc-300 transition-colors text-xs font-medium flex items-center justify-center leading-none"
                >
                  i
                </button>
                <button
                  onClick={() => handlePerfClick(item.exerciseId, item.exerciseName, 'last', item.exerciseCategory)}
                  title="Last session"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors text-xs font-bold flex items-center justify-center leading-none"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="6" cy="6" r="5" />
                    <path d="M6 3v3l1.5 1.5" />
                  </svg>
                </button>
                <button
                  onClick={() => handlePerfClick(item.exerciseId, item.exerciseName, 'best', item.exerciseCategory)}
                  title="Best session"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none"
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
                  onClick={() => handlePerfClick(item.exerciseId, item.exerciseName, 'best60', item.exerciseCategory)}
                  title="Best · 60 days"
                  className="shrink-0 w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center leading-none"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M7 1.5L3.5 6.5H6.5L5 10.5" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {items.length > 1 && (
                  <>
                    <button
                      onClick={() => moveItem(item.localId, 'up')}
                      disabled={itemIdx === 0}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-20 transition-colors text-base leading-none"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveItem(item.localId, 'down')}
                      disabled={itemIdx === items.length - 1}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-20 transition-colors text-base leading-none"
                    >
                      ↓
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleRemove(item.localId)}
                  className="shrink-0 text-zinc-300 hover:text-red-500 dark:text-zinc-700 dark:hover:text-red-500 transition-colors leading-none text-lg"
                >
                  ✕
                </button>
              </div>
            </div>

            {item.exerciseCategory === 'cardio' ? (
              /* Cardio: uniform sets + duration/distance (no dropset) */
              <div className="grid grid-cols-3 gap-3 items-end">
                <Stepper label="Sets" value={item.sets} min={1} max={10} onChange={(v) => updateItem(item.localId, { sets: Math.max(1, v) })} />
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-400 dark:text-zinc-600 uppercase tracking-wide">Duration (min)</span>
                  <input
                    type="number"
                    min={1}
                    value={item.duration_minutes ?? ''}
                    placeholder="—"
                    onChange={(e) => updateItem(item.localId, { duration_minutes: e.target.value ? Number(e.target.value) : null })}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-400 dark:text-zinc-600 uppercase tracking-wide">Distance (km)</span>
                  <input
                    type="number"
                    min={0}
                    value={item.distance ?? ''}
                    placeholder="—"
                    onChange={(e) => updateItem(item.localId, { distance: e.target.value ? Number(e.target.value) : null })}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none"
                  />
                </label>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                    {item.setDetails ? 'Per-set targets' : 'Targets'}
                  </span>
                  <button
                    onClick={() => toggleDropset(item.localId)}
                    className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border transition-colors ${
                      item.setDetails
                        ? 'border-orange-400 text-orange-500 bg-orange-50 dark:bg-orange-950/20'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-orange-400 hover:text-orange-500'
                    }`}
                  >
                    {item.setDetails ? 'Uniform sets' : 'Dropset / per-set'}
                  </button>
                </div>

                {item.setDetails ? (
                  <div className="flex flex-col gap-2">
                    {item.setDetails.map((d, idx) => (
                      <div key={idx} className="flex items-end gap-2">
                        <span className="text-xs font-bold text-zinc-400 w-8 pb-2">#{idx + 1}</span>
                        <Stepper
                          label="Reps"
                          value={d.reps ?? 0}
                          min={0}
                          max={30}
                          onChange={(v) => updateSetDetail(item.localId, idx, { reps: v > 0 ? v : null })}
                        />
                        <label className="flex-1 flex flex-col gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 text-center">kg</span>
                          <input
                            type="number"
                            min={0}
                            value={d.weight ?? ''}
                            placeholder="—"
                            onChange={(e) => updateSetDetail(item.localId, idx, { weight: e.target.value ? Number(e.target.value) : null })}
                            className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-2 text-sm text-center outline-none focus:border-orange-400"
                          />
                        </label>
                        <button
                          onClick={() => removeSetDetail(item.localId, idx)}
                          className="text-zinc-300 hover:text-red-500 dark:text-zinc-700 pb-2 text-lg leading-none"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addSetDetail(item.localId)}
                      className="self-start rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
                    >
                      + Add set
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <Stepper label="Sets" value={item.sets} min={1} max={10} onChange={(v) => updateItem(item.localId, { sets: Math.max(1, v) })} />
                    <Stepper label="Reps" value={item.reps ?? 0} min={0} max={30} onChange={(v) => updateItem(item.localId, { reps: v > 0 ? v : null })} />
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-400 dark:text-zinc-600 uppercase tracking-wide">Weight (kg)</span>
                      <input
                        type="number"
                        min={0}
                        value={item.weight ?? ''}
                        placeholder="—"
                        onChange={(e) => updateItem(item.localId, { weight: e.target.value ? Number(e.target.value) : null })}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none"
                      />
                    </label>
                  </div>
                )}

                {/* PT-prescribed DRUH tempo */}
                <div className="flex flex-col gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                      Tempo (DRUH){item.tempo ? ` · ${formatTempo(item.tempo)}` : ''}
                    </span>
                    <button
                      onClick={() => toggleTempo(item.localId)}
                      className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border transition-colors ${
                        item.tempo
                          ? 'border-orange-400 text-orange-500 bg-orange-50 dark:bg-orange-950/20'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-orange-400 hover:text-orange-500'
                      }`}
                    >
                      {item.tempo ? 'Remove tempo' : 'Set tempo'}
                    </button>
                  </div>
                  {item.tempo && (
                    <div className="grid grid-cols-4 gap-2">
                      <Stepper label="Down" sublabel="lower" value={item.tempo.down} min={0} max={10} onChange={(v) => updateTempo(item.localId, 'down', v)} />
                      <Stepper label="Rest" sublabel="bottom" value={item.tempo.rest} min={0} max={10} onChange={(v) => updateTempo(item.localId, 'rest', v)} />
                      <Stepper label="Up" sublabel="lift" value={item.tempo.up} min={0} max={10} onChange={(v) => updateTempo(item.localId, 'up', v)} />
                      <Stepper label="Hold" sublabel="top" value={item.tempo.hold} min={0} max={10} onChange={(v) => updateTempo(item.localId, 'hold', v)} />
                    </div>
                  )}
                </div>

                {/* PT-prescribed rest target (Tile 6 / D4): wins over the
                    athlete's global stepper for this exercise only; clearing
                    it falls back to the global value. */}
                <div className="flex flex-col gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                      Rest target{item.restSeconds != null ? ` · ${item.restSeconds}s` : ''}
                    </span>
                    <button
                      onClick={() => toggleRestTarget(item.localId)}
                      className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border transition-colors ${
                        item.restSeconds != null
                          ? 'border-orange-400 text-orange-500 bg-orange-50 dark:bg-orange-950/20'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-orange-400 hover:text-orange-500'
                      }`}
                    >
                      {item.restSeconds != null ? 'Remove rest target' : 'Set rest target'}
                    </button>
                  </div>
                  {item.restSeconds != null && (
                    <Stepper
                      label="Rest (s)"
                      value={item.restSeconds}
                      min={0}
                      max={600}
                      onChange={(v) => updateRestTarget(item.localId, v)}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add exercise */}
        <button
          onClick={() => setShowPicker(true)}
          className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 py-4 text-sm font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 hover:border-orange-400 hover:text-orange-500 transition-colors"
        >
          + Add exercise
        </button>

        {/* Start now */}
        <button
          onClick={handleStartNow}
          disabled={isPending}
          className="w-full rounded-xl bg-orange-500 hover:bg-orange-600 py-3 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-40 transition-colors shadow-md shadow-orange-200 dark:shadow-none"
        >
          {isPending ? '…' : isScheduling ? 'Schedule' : 'Start now'}
        </button>

        {/* Delete (edit mode only) */}
        {template && (
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="text-sm text-red-500 hover:text-red-600 transition-colors disabled:opacity-40 text-center"
          >
            Delete template
          </button>
        )}
      </main>
      )}

      {/* Info modal */}
      {infoLoading && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
          <div className="w-10 h-10 rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white animate-spin" />
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
          distanceUnit={readDistanceUnitPref()}
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
          onSelect={handleAddExercise}
          onInfoClick={handleInfoClick}
          onPerfClick={handlePerfClick}
          onClose={() => {
            setShowPicker(false)
            setPickerActiveMuscles([])
            setPickerActiveCategories([])
          }}
        />
      )}

      {/* Paste overwrite confirmation */}
      {showPasteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-1">Overwrite?</p>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Replace current exercises?</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Your current exercise list will be replaced with the clipboard content.
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

      {showDeleteConfirm && template && (
        <Modal
          title={`Delete ${template.name}`}
          destructive
          initialFocusIndex={0}
          onClose={() => {
            if (!isPending) setShowDeleteConfirm(false)
          }}
          backdropClassName="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4"
          panelClassName="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-red-600">Confirm deletion</p>
          <h3 className="mt-2 text-lg font-black text-zinc-950 dark:text-white">Delete {template.name}?</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            This permanently removes the template. Existing workout history is kept. This cannot be undone.
          </p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isPending}
              className="min-h-12 flex-1 rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={isPending}
              className="min-h-12 flex-1 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? 'Deleting…' : 'Delete template permanently'}
            </button>
          </div>
        </Modal>
      )}
      {showMobileMusclePlanner && (
        <MobileMusclePlanner
          exercises={exercises}
          items={items}
          onAddExercise={handleAddExercise}
          onClose={() => setShowMobileMusclePlanner(false)}
        />
      )}
    </div>
  )
}
