'use client' // Error boundaries must be Client Components (Next 16)

// Root error boundary (WP-13, finding M6). Catches crashes the root layout
// itself can't recover from — anything above where per-route error.tsx
// files (e.g. workout/[id]/error.tsx) attach. Per Next 16 convention this
// file replaces the root layout entirely while active, so it must bring its
// own <html>/<body> and its own styles/fonts — nothing from layout.tsx is
// available. A plain <a>, not next/link: this is the last-resort fallback,
// rendered precisely when something about the app shell may be broken, so
// it must not depend on client-side routing working.
import { useEffect } from 'react'
import { Geist } from 'next/font/google'
import './globals.css'
import { formatBoundaryMessage } from '@/lib/errorBoundaryMessage'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export default function GlobalError({
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
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex items-center justify-center bg-zinc-50 dark:bg-black px-6">
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
            <a
              href="/dashboard"
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
