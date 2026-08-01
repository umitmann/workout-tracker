export default function WorkoutLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-4 py-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <span className="h-4 w-14 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500">Saved workout</p>
            <p role="status" className="mt-1 text-sm font-bold text-zinc-700 dark:text-zinc-200">Loading your latest sets…</p>
          </div>
          <span className="h-8 w-16 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </header>
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-6" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <div key={item} className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="mt-4 h-16 rounded-xl bg-zinc-100 dark:bg-zinc-800/70" />
          </div>
        ))}
      </main>
    </div>
  )
}
