'use client' // Error boundaries must be Client Components (Next 16)

// Route-segment error boundary for /workout/[id] (WP-13, finding M6). Wraps
// page.tsx/loading.tsx/WorkoutLogger — a render or data-loading crash mid-
// workout shows this instead of a blank screen. `reset()` re-renders the
// boundary's children in place (retry without a full navigation); the
// dashboard link is the escape hatch when retry can't recover a broken
// workout — a plain <a> so it still works if client-side routing itself is
// implicated in the failure.
import { useEffect } from 'react'
import Link from 'next/link'
import { formatBoundaryMessage } from '@/lib/errorBoundaryMessage'

export default function WorkoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center px-6">
      <div className="max-w-sm w-full flex flex-col items-center gap-4 text-center">
        <h1 className="text-sm font-bold uppercase tracking-widest text-zinc-900 dark:text-white">
          Something went wrong
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {formatBoundaryMessage(error)}
        </p>
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="rounded-full bg-orange-500 hover:bg-orange-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition-colors"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
