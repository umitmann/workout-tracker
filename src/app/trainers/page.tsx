import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import { searchTrainerDirectory } from '@/lib/trainerDal'
import { parseDirectorySearchParams } from '@/lib/trainerValidation'
import TrainerCard from './TrainerCard'

type DirectorySearchParams = {
  q?: string | string[]
  specialty?: string | string[]
  remote?: string | string[]
  page?: string | string[]
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function pageHref(params: DirectorySearchParams, page: number) {
  const query = new URLSearchParams()
  const q = first(params.q).trim()
  const specialty = first(params.specialty).trim()
  const remote = first(params.remote)
  if (q) query.set('q', q)
  if (specialty) query.set('specialty', specialty)
  if (remote) query.set('remote', remote)
  if (page > 1) query.set('page', String(page))
  const suffix = query.toString()
  return suffix ? `/trainers?${suffix}` : '/trainers'
}

export default async function TrainersPage({
  searchParams,
}: {
  searchParams: Promise<DirectorySearchParams>
}) {
  const { user } = await getServerAuthContext()
  if (!user) redirect('/')

  const params = await searchParams
  const parsed = parseDirectorySearchParams(params)
  const trainers = parsed.success ? await searchTrainerDirectory(parsed.data) : []
  const validationMessage = parsed.success
    ? null
    : Object.values(parsed.fieldErrors).flat()[0] ?? 'Invalid search.'
  const page = parsed.success ? parsed.data.page : 1
  const hasNextPage = parsed.success && trainers.length === parsed.data.pageSize

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-white"
            >
              ← Back
            </Link>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Find a trainer</h1>
          </div>
          <Link
            href="/trainers/apply"
            className="text-sm font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400"
          >
            Trainer profile
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
            Personal trainers
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Search approved trainer profiles. Private account and review data is never shown here.
          </p>
        </div>

        <form
          action="/trainers"
          method="get"
          role="search"
          className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 sm:col-span-2">
            Find a trainer
            <input
              type="search"
              name="q"
              defaultValue={first(params.q)}
              maxLength={100}
              placeholder="Name, specialty, or location"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none focus:ring-2 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Specialty
            <input
              name="specialty"
              defaultValue={first(params.specialty)}
              maxLength={40}
              placeholder="e.g. strength training"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none focus:ring-2 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Availability
            <select
              name="remote"
              defaultValue={first(params.remote)}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none focus:ring-2 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            >
              <option value="">Any location</option>
              <option value="true">Remote available</option>
              <option value="false">In-person only</option>
            </select>
          </label>
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-orange-600 sm:col-span-2"
          >
            Search trainers
          </button>
        </form>

        {validationMessage && (
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {validationMessage}
          </p>
        )}

        {!validationMessage && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400" aria-live="polite">
            {trainers.length === 0
              ? 'No approved trainers match these filters.'
              : `${trainers.length} trainer${trainers.length === 1 ? '' : 's'} on this page`}
          </p>
        )}

        <div className="flex flex-col gap-4">
          {trainers.map((trainer) => (
            <TrainerCard key={trainer.id} trainer={trainer} />
          ))}
        </div>

        {(page > 1 || hasNextPage) && (
          <nav aria-label="Trainer directory pages" className="flex items-center justify-between">
            {page > 1 ? (
              <Link href={pageHref(params, page - 1)} className="text-sm font-semibold text-orange-600">
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            {hasNextPage && (
              <Link href={pageHref(params, page + 1)} className="text-sm font-semibold text-orange-600">
                Next →
              </Link>
            )}
          </nav>
        )}
      </main>
    </div>
  )
}
