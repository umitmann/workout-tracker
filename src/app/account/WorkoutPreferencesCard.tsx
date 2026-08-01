'use client'

import { useState } from 'react'
import {
  readWorkoutPreferences,
  WorkoutPreferences,
  writeWorkoutPreferences,
} from '@/lib/workoutPreferences'

function Switch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-16 items-center justify-between gap-4 rounded-2xl border border-zinc-200 px-4 py-3 dark:border-zinc-700">
      <span>
        <span className="block text-sm font-bold text-zinc-900 dark:text-white">{label}</span>
        <span className="block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{description}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-5 shrink-0 accent-orange-600" />
    </label>
  )
}

export default function WorkoutPreferencesCard() {
  const [preferences, setPreferences] = useState<WorkoutPreferences>(() => readWorkoutPreferences())

  function update(patch: Partial<WorkoutPreferences>) {
    const next = { ...preferences, ...patch }
    setPreferences(next)
    writeWorkoutPreferences(next)
  }

  return (
    <section aria-labelledby="training-defaults-heading" className="rounded-[1.6rem] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">On this device</p>
          <h2 id="training-defaults-heading" className="mt-2 text-2xl font-black tracking-tight text-zinc-950 dark:text-white">Training defaults</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">Set these once. You can still change them from any active workout.</p>
        </div>
        <span className="min-w-24 text-right text-xs font-bold text-emerald-600">Saved automatically</span>
      </div>

      <div className="mt-5 grid gap-3">
        <Switch label="Start rest automatically" description="Begin the rest timer when you complete a strength set." checked={preferences.autoStartRest} onChange={(checked) => update({ autoStartRest: checked })} />
        <Switch label="Rest inside guided mode" description="Use the same rest timer between guided sets." checked={preferences.guideRestBetweenSets} onChange={(checked) => update({ guideRestBetweenSets: checked })} />

        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-700">
          <p className="text-sm font-bold text-zinc-900 dark:text-white">Rest timer</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(['fixed', 'variable'] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => update({ restMode: mode })} className={`min-h-11 rounded-xl border text-sm font-bold ${preferences.restMode === mode ? 'border-orange-600 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300' : 'border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'}`}>
                {mode === 'fixed' ? 'Countdown' : 'Count up'}
              </button>
            ))}
          </div>
          {preferences.restMode === 'fixed' && (
            <label className="mt-3 flex items-center justify-between gap-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Default rest
              <select value={preferences.restTarget} onChange={(event) => update({ restTarget: Number(event.target.value) })} className="min-h-11 rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-950">
                {[30, 45, 60, 75, 90, 120, 150, 180].map((seconds) => <option key={seconds} value={seconds}>{seconds}s</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-700">
          <p className="text-sm font-bold text-zinc-900 dark:text-white">Distance display</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(['km', 'm'] as const).map((unit) => (
              <button key={unit} type="button" onClick={() => update({ distanceUnit: unit })} className={`min-h-11 rounded-xl border text-sm font-bold uppercase ${preferences.distanceUnit === unit ? 'border-orange-600 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300' : 'border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'}`}>{unit}</button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
