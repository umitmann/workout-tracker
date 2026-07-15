import Link from 'next/link'

export default function OfflinePage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-zinc-50 px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] dark:bg-zinc-950">
      <section className="w-full max-w-sm rounded-[2rem] border border-zinc-200 bg-white p-7 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-orange-100 text-3xl dark:bg-orange-950/40" aria-hidden="true">↻</div>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-orange-500">You are offline</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-zinc-950 dark:text-white">Reconnect before logging</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Workout and account data stay network-only for privacy and reliable syncing. Your existing server data has not been removed.</p>
        <Link href="/dashboard" className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-orange-600 px-5 text-sm font-black text-white">Try again</Link>
      </section>
    </main>
  )
}
