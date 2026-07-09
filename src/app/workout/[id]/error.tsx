'use client' // Error boundaries must be Client Components (Next 16)

// Route-segment error boundary for /workout/[id] (WP-13, finding M6). Wraps
// page.tsx/loading.tsx/WorkoutLogger — a render or data-loading crash mid-
// workout shows this instead of a blank screen. `unstable_retry()` (Next 16)
// re-runs the segment INCLUDING its data fetches — `reset()` only re-renders
// in place, which cannot recover a failed fetch. The dashboard Link is the
// escape hatch when retry can't recover (the app shell/router is intact at a
// segment boundary, so Link is safe here; global-error uses a plain <a>).
import { useEffect } from 'react'
import Link from 'next/link'
import { formatBoundaryMessage } from '@/lib/errorBoundaryMessage'

export default function WorkoutError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
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
            onClick={() => unstable_retry()}
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
