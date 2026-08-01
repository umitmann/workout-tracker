'use client'

import { useActionState } from 'react'
import { saveDailyReadinessAction } from '@/app/actions/readiness'
import {
  READINESS_OPTIONS,
  type DailyReadiness,
} from '@/lib/readinessTypes'

export default function DailyReadinessCard({
  initial,
  available = true,
}: {
  initial: DailyReadiness | null
  available?: boolean
}) {
  const [state, action, pending] = useActionState(saveDailyReadinessAction, null)
  const selected = state?.success ? state.readiness?.feeling : initial?.feeling

  return (
    <section aria-labelledby="daily-readiness-title" className="mt-4 rounded-[1.4rem] border border-zinc-200/80 bg-white p-4 shadow-sm shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Daily check-in</p>
          <h2 id="daily-readiness-title" className="mt-1 text-lg font-black tracking-tight text-zinc-950 dark:text-white">How are you feeling today?</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Private to you. Tap again any time today to change it.</p>
        </div>

        {available ? (
          <form action={action} aria-label="Choose how you feel" className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {READINESS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="submit"
                name="feeling"
                value={option.value}
                aria-label={option.label}
                aria-pressed={selected === option.value}
                disabled={pending}
                className={`group flex min-h-14 min-w-14 flex-col items-center justify-center rounded-xl border px-1 transition disabled:opacity-60 ${selected === option.value ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-500/20 dark:bg-orange-950/50' : 'border-zinc-200 hover:border-orange-300 hover:bg-orange-50/60 dark:border-zinc-700 dark:hover:bg-orange-950/30'}`}
              >
                <span aria-hidden="true" className="text-2xl transition group-hover:scale-110">{option.emoji}</span>
                <span className="mt-0.5 text-[0.62rem] font-bold text-zinc-500 dark:text-zinc-400">{option.label}</span>
              </button>
            ))}
          </form>
        ) : (
          <p className="rounded-xl bg-zinc-100 px-4 py-3 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">Check-in will appear after the database update.</p>
        )}
      </div>

      {state && (
        <p role={state.success ? 'status' : 'alert'} aria-live="polite" className={`mt-3 text-xs font-semibold ${state.success ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
          {state.message}
        </p>
      )}
    </section>
  )
}
