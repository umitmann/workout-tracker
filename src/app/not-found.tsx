import Link from 'next/link'

export default function NotFound() {
  return (
    <main id="main-content" className="grid min-h-screen place-items-center bg-[var(--color-canvas)] px-5 py-12 text-[var(--color-ink)]">
      <section className="w-full max-w-lg rounded-[1.75rem] border border-zinc-200 bg-white p-7 shadow-xl shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">404</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 dark:text-white">Not found</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          This page does not exist or you do not have access to it.
        </p>
        <Link
          href="/dashboard"
          className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-700"
        >
          Back to dashboard
        </Link>
      </section>
    </main>
  )
}
