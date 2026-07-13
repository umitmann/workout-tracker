import type { Metadata } from 'next'
import { Suspense } from 'react'
import AuthPanel from './AuthPanel'

export const metadata: Metadata = {
  title: 'Sign in · Workout Tracker',
  description: 'Plan training, log every set, and collaborate safely with a personal trainer.',
}

export default function Home() {
  return (
    <main className="grid min-h-screen bg-[var(--color-canvas)] lg:grid-cols-[minmax(28rem,1.05fr)_minmax(28rem,.95fr)]">
      <section className="relative hidden overflow-hidden bg-zinc-950 p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16" aria-labelledby="brand-heading">
        <div className="absolute -right-24 -top-20 h-96 w-96 rounded-full bg-orange-600/20 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-28 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden="true" />

        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-600 text-lg font-black shadow-lg shadow-orange-950/30">W</span>
          <span className="text-base font-black tracking-tight">Workout Tracker</span>
        </div>

        <div className="relative max-w-2xl py-16">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-400">Train with intent</p>
          <h1 id="brand-heading" className="mt-5 text-5xl font-black leading-[1.02] tracking-[-0.055em] xl:text-6xl">
            Your training.<br />Clearly planned.<br />Honestly tracked.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-zinc-300">
            Build sessions that fit real life, keep every result yours, and invite a trainer into only the parts you choose.
          </p>
        </div>

        <ul className="relative grid gap-3 text-sm text-zinc-300 sm:grid-cols-3" aria-label="Product principles">
          <li className="rounded-2xl border border-white/10 bg-white/5 p-4"><strong className="block text-white">Plan</strong><span className="mt-1 block">Stable workout prescriptions</span></li>
          <li className="rounded-2xl border border-white/10 bg-white/5 p-4"><strong className="block text-white">Perform</strong><span className="mt-1 block">Fast, focused logging</span></li>
          <li className="rounded-2xl border border-white/10 bg-white/5 p-4"><strong className="block text-white">Share</strong><span className="mt-1 block">Explicit, revocable consent</span></li>
        </ul>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10 lg:py-16" aria-label="Account access">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-orange-600 font-black text-white shadow-sm">W</span>
            <span className="text-sm font-black tracking-tight text-zinc-950 dark:text-white">Workout Tracker</span>
          </div>
          <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-zinc-100 dark:bg-zinc-900" />}>
            <AuthPanel />
          </Suspense>
        </div>
      </section>
    </main>
  )
}
