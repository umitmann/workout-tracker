'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import type { SlimExercise } from '@/app/workout/[id]/ExercisePickerSheet'
import { MUSCLE_GROUPS, musclesForGroup } from '@/lib/muscleGroups'
import { calculateMuscleLoad } from '@/lib/muscleLoad'
import MuscleBody3D from './MuscleBody3D'
import type { TemplateExercise, TemplateExerciseUpdate } from './TemplateEditor'

const CATALOG_WINDOW = 80

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function nullableNumber(value: string): number | null {
  if (value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export default function DesktopWorkoutGenerator({
  exercises,
  items,
  name,
  error,
  isPending,
  actionLabel,
  onNameChange,
  onAddExercise,
  onRemoveExercise,
  onMoveExercise,
  onUpdateExercise,
  onSave,
  onStart,
  onUseClassic,
}: {
  exercises: SlimExercise[]
  items: TemplateExercise[]
  name: string
  error: string | null
  isPending: boolean
  actionLabel: string
  onNameChange: (name: string) => void
  onAddExercise: (exercise: SlimExercise) => void
  onRemoveExercise: (localId: string) => void
  onMoveExercise: (localId: string, direction: 'up' | 'down') => void
  onUpdateExercise: (localId: string, patch: TemplateExerciseUpdate) => void
  onSave: () => void
  onStart: () => void
  onUseClassic: () => void
}) {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [activeMuscle, setActiveMuscle] = useState<string | null>(null)
  const [hoveredExerciseId, setHoveredExerciseId] = useState<number | null>(null)

  const exerciseById = useMemo(
    () => new Map(exercises.map((exercise) => [exercise.id, exercise])),
    [exercises],
  )
  const muscleLoad = useMemo(
    () => calculateMuscleLoad(items, exercises),
    [exercises, items],
  )
  const loadByMuscle = useMemo(
    () => Object.fromEntries(muscleLoad.muscles.map((entry) => [entry.muscle, entry.percentage])),
    [muscleLoad.muscles],
  )
  const previewMuscles = useMemo(() => {
    const exercise = hoveredExerciseId == null ? null : exerciseById.get(hoveredExerciseId)
    return [...new Set([...(exercise?.muscles ?? []), ...(exercise?.muscles_secondary ?? [])])]
  }, [exerciseById, hoveredExerciseId])

  const filteredExercises = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    const groupMuscles = activeGroup ? musclesForGroup(activeGroup) : []
    return exercises.filter((exercise) => {
      if (query && !`${exercise.name} ${exercise.equipment ?? ''}`.toLowerCase().includes(query)) return false
      const muscles = [...(exercise.muscles ?? []), ...(exercise.muscles_secondary ?? [])]
      if (activeMuscle && !muscles.includes(activeMuscle)) return false
      if (groupMuscles.length > 0 && !muscles.some((muscle) => groupMuscles.includes(muscle))) return false
      return true
    })
  }, [activeGroup, activeMuscle, deferredSearch, exercises])

  const allMappedMuscles = useMemo(() => {
    const standard = MUSCLE_GROUPS.flatMap((group) => group.muscles)
    const extra = muscleLoad.muscles.map((entry) => entry.muscle).filter((muscle) => !standard.includes(muscle))
    return [...standard, ...extra]
  }, [muscleLoad.muscles])

  function selectMuscle(muscle: string) {
    setActiveGroup(null)
    setActiveMuscle((current) => (current === muscle ? null : muscle))
  }

  return (
    <main className="mx-auto w-full max-w-[1800px] px-6 py-6 2xl:px-10" data-testid="desktop-workout-generator">
      <div className="mb-5 flex items-end gap-5">
        <label className="min-w-0 flex-1">
          <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">Workout name</span>
          <input
            type="text"
            placeholder="Workout name…"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className="w-full rounded-2xl border border-zinc-200 bg-white px-5 py-3.5 text-lg font-bold text-zinc-950 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:focus:ring-orange-950"
          />
        </label>
        <div className="pb-1 text-right">
          <p className="text-2xl font-black tabular-nums text-zinc-950 dark:text-white">{muscleLoad.totalProgrammedSets}</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">programmed sets</p>
        </div>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

      <div className="grid grid-cols-[minmax(220px,0.78fr)_minmax(360px,1.25fr)_minmax(260px,0.9fr)] gap-3 xl:gap-5">
        <section aria-label="Exercise library" className="flex min-h-0 min-w-0 flex-col rounded-[28px] border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-500">1 · Select</p>
            <h2 className="mt-1 text-xl font-black text-zinc-950 dark:text-white">Exercise library</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">Hover to preview. Add it to update the body instantly.</p>
          </div>
          <label className="relative block">
            <span className="sr-only">Search exercises</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search exercise or equipment…"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-3 pl-4 pr-10 text-sm outline-none focus:border-orange-400 dark:border-zinc-700 dark:bg-zinc-950"
            />
            {search && <button type="button" aria-label="Clear exercise search" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white">×</button>}
          </label>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {MUSCLE_GROUPS.map((group) => (
              <button
                key={group.key}
                type="button"
                aria-pressed={activeGroup === group.key}
                onClick={() => { setActiveMuscle(null); setActiveGroup((current) => current === group.key ? null : group.key) }}
                className={`rounded-full px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide transition ${activeGroup === group.key ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-orange-100 hover:text-orange-700 dark:bg-zinc-800 dark:text-zinc-300'}`}
              >
                {group.label}
              </button>
            ))}
          </div>
          {(activeMuscle || activeGroup) && (
            <button type="button" onClick={() => { setActiveMuscle(null); setActiveGroup(null) }} className="mt-3 self-start text-xs font-bold text-orange-600 hover:text-orange-700">
              Clear {activeMuscle ? titleCase(activeMuscle) : 'muscle group'} filter
            </button>
          )}
          <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
            {filteredExercises.slice(0, CATALOG_WINDOW).map((exercise) => {
              const selectedCount = items.filter((item) => item.exerciseId === exercise.id).length
              return (
                <article
                  key={exercise.id}
                  onMouseEnter={() => setHoveredExerciseId(exercise.id)}
                  onMouseLeave={() => setHoveredExerciseId((current) => current === exercise.id ? null : current)}
                  onFocus={() => setHoveredExerciseId(exercise.id)}
                  className="group rounded-2xl border border-zinc-200 p-3 transition hover:border-orange-300 hover:bg-orange-50/50 dark:border-zinc-800 dark:hover:border-orange-700 dark:hover:bg-orange-950/10"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold text-zinc-900 dark:text-white">{exercise.name}</h3>
                      <p className="mt-0.5 truncate text-[11px] capitalize text-zinc-500">{exercise.equipment ?? exercise.category ?? 'Exercise'}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Add ${exercise.name}`}
                      onClick={() => onAddExercise(exercise)}
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-950 text-lg font-medium text-white transition hover:scale-105 hover:bg-orange-500 focus-visible:outline-2 focus-visible:outline-orange-400 dark:bg-white dark:text-zinc-950 dark:hover:bg-orange-500 dark:hover:text-white"
                    >
                      +
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(exercise.muscles ?? []).slice(0, 3).map((muscle) => <span key={muscle} className="rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-orange-800 dark:bg-orange-950/40 dark:text-orange-300">{muscle}</span>)}
                    {selectedCount > 0 && <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[9px] font-bold text-white dark:bg-white dark:text-zinc-950">IN PLAN ×{selectedCount}</span>}
                  </div>
                </article>
              )
            })}
            {filteredExercises.length === 0 && <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">No matching exercises. Clear a filter or try another search.</p>}
          </div>
          {filteredExercises.length > CATALOG_WINDOW && <p className="mt-3 text-center text-[11px] text-zinc-500">Showing the first {CATALOG_WINDOW} of {filteredExercises.length}. Search to narrow the list.</p>}
        </section>

        <section aria-label="Muscle exposure map" className="min-w-0">
          <div className="mb-3 flex items-end justify-between px-1">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-500">2 · See the load</p>
              <h2 className="mt-1 text-xl font-black text-zinc-950 dark:text-white">Programmed muscle exposure</h2>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              <span className="size-2 rounded-full bg-zinc-500" /> None
              <span className="size-2 rounded-full bg-amber-400" /> Moderate
              <span className="size-2 rounded-full bg-red-500" /> Highest
            </div>
          </div>
          <MuscleBody3D loadByMuscle={loadByMuscle} previewMuscles={previewMuscles} selectedMuscle={activeMuscle} onSelectMuscle={selectMuscle} />
          <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Keyboard muscle map</p>
              <p className="text-[10px] text-zinc-500">Primary set = 1.0 · Secondary set = 0.5</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-3 2xl:grid-cols-4">
              {allMappedMuscles.map((muscle) => {
                const exposure = muscleLoad.byMuscle[muscle]
                const percentage = exposure?.percentage ?? 0
                const score = exposure?.score ?? 0
                return (
                  <button
                    key={muscle}
                    type="button"
                    aria-label={`Filter exercises by ${muscle}`}
                    aria-pressed={activeMuscle === muscle}
                    onClick={() => selectMuscle(muscle)}
                    className={`flex min-w-0 items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-[10px] font-bold capitalize transition ${activeMuscle === muscle ? 'border-orange-500 bg-orange-500 text-white' : 'border-zinc-200 text-zinc-600 hover:border-orange-300 dark:border-zinc-700 dark:text-zinc-300'}`}
                  >
                    <span className="truncate">{muscle}</span>
                    <span className="shrink-0 tabular-nums">{Number.isInteger(score) ? score : score.toFixed(1)} eq · {percentage}%</span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[10px] leading-4 text-zinc-500">“eq” means set-equivalents. Relative exposure is a planning aid—not a medical or biomechanical measurement.</p>
          </div>
        </section>

        <section aria-label="Selected workout" className="flex min-h-0 min-w-0 flex-col rounded-[28px] border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-500">3 · Program</p>
              <h2 className="mt-1 text-xl font-black text-zinc-950 dark:text-white">Your workout</h2>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-black tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{items.length}</span>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
            {items.length === 0 && <div className="rounded-2xl border-2 border-dashed border-zinc-200 px-5 py-12 text-center dark:border-zinc-700"><p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Build from the library</p><p className="mt-1 text-xs leading-5 text-zinc-500">Exercises appear here with their set targets.</p></div>}
            {items.map((item, index) => (
              <article key={item.localId} className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-950/60">
                <div className="flex items-start gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-zinc-900 text-[10px] font-black text-white dark:bg-white dark:text-zinc-950">{index + 1}</span>
                  <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold text-zinc-900 dark:text-white">{item.exerciseName}</h3><p className="mt-0.5 text-[10px] capitalize text-zinc-500">{item.exerciseCategory ?? 'Exercise'}</p></div>
                  <button type="button" aria-label={`Move ${item.exerciseName} up`} disabled={index === 0} onClick={() => onMoveExercise(item.localId, 'up')} className="size-7 text-zinc-400 disabled:opacity-20 hover:text-zinc-900 dark:hover:text-white">↑</button>
                  <button type="button" aria-label={`Move ${item.exerciseName} down`} disabled={index === items.length - 1} onClick={() => onMoveExercise(item.localId, 'down')} className="size-7 text-zinc-400 disabled:opacity-20 hover:text-zinc-900 dark:hover:text-white">↓</button>
                  <button type="button" aria-label={`Remove ${item.exerciseName}`} onClick={() => onRemoveExercise(item.localId)} className="size-7 text-zinc-400 hover:text-red-500">×</button>
                </div>
                {item.setDetails ? (
                  <button type="button" onClick={onUseClassic} className="mt-3 w-full rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-left text-xs font-bold text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300">
                    {item.setDetails.length} per-set targets · Edit in advanced view →
                  </button>
                ) : item.exerciseCategory === 'cardio' ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <CompactNumber label={`${item.exerciseName} sets`} displayLabel="Sets" value={item.sets} min={1} onChange={(sets) => onUpdateExercise(item.localId, { sets: sets ?? 1 })} />
                    <CompactNumber label={`${item.exerciseName} duration minutes`} displayLabel="Minutes" value={item.duration_minutes} min={0} onChange={(duration_minutes) => onUpdateExercise(item.localId, { duration_minutes })} />
                    <CompactNumber label={`${item.exerciseName} distance kilometers`} displayLabel="Km" value={item.distance} min={0} step="0.1" onChange={(distance) => onUpdateExercise(item.localId, { distance })} />
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <CompactNumber label={`${item.exerciseName} sets`} displayLabel="Sets" value={item.sets} min={1} onChange={(sets) => onUpdateExercise(item.localId, { sets: sets ?? 1 })} />
                    <CompactNumber label={`${item.exerciseName} reps`} displayLabel="Reps" value={item.reps} min={0} onChange={(reps) => onUpdateExercise(item.localId, { reps })} />
                    <CompactNumber label={`${item.exerciseName} weight kilograms`} displayLabel="Kg" value={item.weight} min={0} step="0.5" onChange={(weight) => onUpdateExercise(item.localId, { weight })} />
                  </div>
                )}
              </article>
            ))}
          </div>
          <button type="button" onClick={onUseClassic} className="mt-4 rounded-xl border border-zinc-300 px-4 py-3 text-xs font-black uppercase tracking-wide text-zinc-700 transition hover:border-orange-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300">
            Fine-tune advanced targets
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={onSave} disabled={isPending} className="rounded-xl bg-zinc-900 px-4 py-3 text-xs font-black uppercase tracking-wide text-white disabled:opacity-40 dark:bg-zinc-700">Save</button>
            <button type="button" onClick={onStart} disabled={isPending} className="rounded-xl bg-orange-500 px-4 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-orange-200 transition hover:bg-orange-600 disabled:opacity-40 dark:shadow-none">{isPending ? '…' : actionLabel}</button>
          </div>
        </section>
      </div>
    </main>
  )
}

function CompactNumber({
  label,
  displayLabel,
  value,
  min,
  step = '1',
  onChange,
}: {
  label: string
  displayLabel: string
  value: number | null
  min: number
  step?: string
  onChange: (value: number | null) => void
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-center text-[9px] font-black uppercase tracking-wide text-zinc-500">{displayLabel}</span>
      <input aria-label={label} type="number" min={min} step={step} value={value ?? ''} onChange={(event) => onChange(nullableNumber(event.target.value))} className="w-full rounded-lg border border-zinc-200 bg-white px-1.5 py-2 text-center text-sm font-bold tabular-nums outline-none focus:border-orange-400 dark:border-zinc-700 dark:bg-zinc-900" />
    </label>
  )
}
