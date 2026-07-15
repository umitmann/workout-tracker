'use client'

import { useMemo, useState } from 'react'
import type { SlimExercise } from '@/app/workout/[id]/ExercisePickerSheet'
import Modal from '@/components/Modal'
import { calculateMuscleLoad } from '@/lib/muscleLoad'
import { MOBILE_MUSCLE_REGIONS, type MobileMuscleView } from '@/lib/mobileMuscleMap'
import type { TemplateExercise } from './TemplateEditor'

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function exposureColor(percentage: number, selected: boolean) {
  if (selected) return '#0ea5e9'
  if (percentage >= 75) return '#ef4444'
  if (percentage >= 45) return '#f97316'
  if (percentage > 0) return '#fbbf24'
  return '#71717a'
}

function AnatomyFigure({
  view,
  loadByMuscle,
  selectedMuscle,
  onSelect,
}: {
  view: MobileMuscleView
  loadByMuscle: Readonly<Record<string, number>>
  selectedMuscle: string | null
  onSelect: (muscle: string) => void
}) {
  const regions = MOBILE_MUSCLE_REGIONS.filter((region) => region.view === view)
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-center text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{view}</p>
      <svg viewBox="0 0 180 430" role="img" aria-label={`${view} muscle anatomy`} className="mx-auto h-auto w-full max-w-[12rem]">
        <g fill="#d4d4d8" stroke="#a1a1aa" strokeWidth="1.5" pointerEvents="none">
          <ellipse cx="90" cy="40" rx="25" ry="31" />
          <path d="M72 68 Q90 59 108 68 L111 86 Q141 91 151 113 L143 190 L153 247 Q148 255 136 251 L122 191 L119 221 Q120 244 116 261 L124 335 L117 416 L96 416 L90 342 L84 416 L63 416 L56 335 L64 261 Q60 244 61 221 L58 191 L44 251 Q32 255 27 247 L37 190 L29 113 Q39 91 69 86 Z" />
        </g>
        <g fill="none" stroke="#a1a1aa" strokeWidth="0.8" opacity="0.65" pointerEvents="none">
          <path d="M90 72 V226 M62 220 Q90 236 118 220 M90 262 V416" />
        </g>
        {regions.map((region) => {
          const percentage = loadByMuscle[region.muscle] ?? 0
          const selected = region.muscle === selectedMuscle
          const fill = exposureColor(percentage, selected)
          return (
            <g
              key={region.id}
              role="button"
              tabIndex={0}
              aria-label={`${titleCase(region.muscle)}, ${percentage}% relative exposure`}
              aria-pressed={selected}
              onClick={() => onSelect(region.muscle)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(region.muscle)
                }
              }}
              className="cursor-pointer outline-none"
              fill={fill}
              fillOpacity={selected ? 0.98 : percentage > 0 ? 0.86 : 0.38}
              stroke={selected ? '#e0f2fe' : '#27272a'}
              strokeWidth={selected ? 3 : 1}
            >
              {region.shapes.map((shape, index) => shape.kind === 'path' ? (
                <path key={index} d={shape.d} />
              ) : (
                <ellipse key={index} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} transform={shape.rotate ? `rotate(${shape.rotate} ${shape.cx} ${shape.cy})` : undefined} />
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function MobileMusclePlanner({
  exercises,
  items,
  onAddExercise,
  onClose,
}: {
  exercises: SlimExercise[]
  items: TemplateExercise[]
  onAddExercise: (exercise: SlimExercise) => void
  onClose: () => void
}) {
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null)
  const muscleLoad = useMemo(() => calculateMuscleLoad(items, exercises), [items, exercises])
  const loadByMuscle = useMemo(
    () => Object.fromEntries(muscleLoad.muscles.map((entry) => [entry.muscle, entry.percentage])),
    [muscleLoad.muscles],
  )
  const matchingExercises = useMemo(() => {
    if (!selectedMuscle) return []
    return exercises
      .filter((exercise) => [...(exercise.muscles ?? []), ...(exercise.muscles_secondary ?? [])].includes(selectedMuscle))
      .slice(0, 24)
  }, [exercises, selectedMuscle])

  function selectMuscle(muscle: string) {
    setSelectedMuscle((current) => current === muscle ? null : muscle)
  }

  return (
    <Modal
      title="Mobile muscle planner"
      onClose={onClose}
      backdropClassName="fixed inset-0 z-[80] bg-black/70 lg:hidden"
      panelClassName="flex h-[100dvh] w-full flex-col overflow-hidden bg-zinc-50 pb-[env(safe-area-inset-bottom)] outline-none dark:bg-zinc-950"
    >
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">Phone muscle planner</p>
          <h2 className="text-lg font-black text-zinc-950 dark:text-white">See the load before you train</h2>
        </div>
        <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full border border-zinc-200 text-xl text-zinc-600 dark:border-zinc-700 dark:text-zinc-300" aria-label="Close muscle planner">×</button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <section className="rounded-[1.5rem] border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900" aria-label="Muscle exposure map">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Tap a region to find exercises</p>
            <p className="text-xs font-black tabular-nums text-orange-500">{muscleLoad.totalProgrammedSets} sets</p>
          </div>
          <div className="flex items-start justify-center gap-1">
            <AnatomyFigure view="front" loadByMuscle={loadByMuscle} selectedMuscle={selectedMuscle} onSelect={selectMuscle} />
            <AnatomyFigure view="back" loadByMuscle={loadByMuscle} selectedMuscle={selectedMuscle} onSelect={selectMuscle} />
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-2 text-[9px] font-bold uppercase tracking-wide text-zinc-500">
            <span><i className="mr-1 inline-block size-2 rounded-full bg-zinc-500" />None</span>
            <span><i className="mr-1 inline-block size-2 rounded-full bg-amber-400" />Some</span>
            <span><i className="mr-1 inline-block size-2 rounded-full bg-red-500" />Highest</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5" aria-label="Muscle shortcuts">
            {[...new Set(MOBILE_MUSCLE_REGIONS.map((region) => region.muscle))].map((muscle) => {
              const percentage = loadByMuscle[muscle] ?? 0
              const selected = selectedMuscle === muscle
              return (
                <button
                  key={muscle}
                  type="button"
                  aria-label={`Select ${muscle}`}
                  aria-pressed={selected}
                  onClick={() => selectMuscle(muscle)}
                  className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 text-left text-xs font-bold capitalize ${selected ? 'border-sky-500 bg-sky-500 text-white' : 'border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'}`}
                >
                  <span className="truncate">{muscle}</span>
                  <span className="shrink-0 tabular-nums">{percentage}%</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="mt-4" aria-live="polite">
          {selectedMuscle ? (
            <>
              <div className="mb-2 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">{titleCase(selectedMuscle)}</p>
                  <h3 className="text-base font-black text-zinc-950 dark:text-white">Matching exercises</h3>
                </div>
                <button type="button" onClick={() => setSelectedMuscle(null)} className="text-xs font-bold text-zinc-500">Clear</button>
              </div>
              <div className="space-y-2">
                {matchingExercises.map((exercise) => {
                  const count = items.filter((item) => item.exerciseId === exercise.id).length
                  return (
                    <article key={exercise.id} className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-bold text-zinc-900 dark:text-white">{exercise.name}</h4>
                        <p className="truncate text-xs capitalize text-zinc-500">{exercise.equipment ?? exercise.category ?? 'Exercise'}{count ? ` · in plan ×${count}` : ''}</p>
                      </div>
                      <button type="button" onClick={() => onAddExercise(exercise)} className="min-h-11 rounded-full bg-zinc-950 px-4 text-xs font-black uppercase tracking-wide text-white dark:bg-white dark:text-zinc-950" aria-label={`Add ${exercise.name}`}>Add</button>
                    </article>
                  )
                })}
                {matchingExercises.length === 0 && <p className="rounded-xl border border-dashed border-zinc-300 p-5 text-center text-sm text-zinc-500 dark:border-zinc-700">No catalog exercise is tagged for this region yet.</p>}
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-300 p-5 text-center text-sm leading-6 text-zinc-500 dark:border-zinc-700">Choose a region on the front or back. The map updates as you add exercises; primary sets count 1.0 and secondary sets count 0.5.</p>
          )}
        </section>
      </div>
    </Modal>
  )
}
