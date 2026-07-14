export default function AppPageLoading() {
  return (
    <div className="min-h-screen bg-[var(--color-canvas)] px-5 py-5 sm:px-7" role="status" aria-label="Loading page">
      <span className="sr-only">Loading…</span>
      <div className="mx-auto max-w-5xl animate-pulse">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded-full bg-orange-100 dark:bg-orange-950" />
            <div className="h-7 w-44 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="h-11 w-11 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="h-40 rounded-[1.5rem] bg-zinc-200 dark:bg-zinc-900" />
          <div className="h-40 rounded-[1.5rem] bg-zinc-200 dark:bg-zinc-900" />
          <div className="h-28 rounded-[1.5rem] bg-zinc-200 dark:bg-zinc-900 sm:col-span-2" />
        </div>
      </div>
    </div>
  )
}
