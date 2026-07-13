'use client'

// ADR-0005: startWorkout no longer defaults "today" on the server (which
// would use the server's UTC clock, not the user's local day) — this client
// wrapper computes the local calendar date and passes it explicitly. Kept as
// its own tiny client component so the surrounding dashboard page can stay a
// server component.
import { useTransition } from 'react'
import { startWorkout } from '@/app/actions/workouts'
import { localDateStr } from '@/lib/localDate'

export default function StartWorkoutButton() {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(() => {
      startWorkout(localDateStr())
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex min-h-14 min-w-44 items-center justify-center rounded-2xl bg-orange-500 px-7 py-3 text-sm font-black text-white shadow-lg shadow-orange-950/25 transition hover:-translate-y-0.5 hover:bg-orange-400 disabled:translate-y-0 disabled:opacity-60"
    >
      {isPending ? 'Starting…' : 'Start workout'}
    </button>
  )
}
