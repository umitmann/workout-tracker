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
      className="rounded-full bg-orange-500 hover:bg-orange-600 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors shadow-md shadow-orange-200 dark:shadow-none disabled:opacity-60"
    >
      {isPending ? '…' : 'Start workout'}
    </button>
  )
}
