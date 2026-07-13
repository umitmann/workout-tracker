import Link from 'next/link'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { buildAppNavigation } from '@/lib/appNavigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import { searchTrainerDirectory } from '@/lib/trainerDal'
import { listMyTrainerRelationships } from '@/lib/trainerRelationshipDal'
import { countTrainerRelationshipNotifications } from '@/lib/trainerRelationshipNotifications'
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
  const [trainers, relationships] = await Promise.all([
    parsed.success ? searchTrainerDirectory(parsed.data) : Promise.resolve([]),
    listMyTrainerRelationships(),
  ])
  const validationMessage = parsed.success
    ? null
    : Object.values(parsed.fieldErrors).flat()[0] ?? 'Invalid search.'
  const page = parsed.success ? parsed.data.page : 1
  const hasNextPage = parsed.success && trainers.length === parsed.data.pageSize
  const notifications = countTrainerRelationshipNotifications(relationships)
  const userName = user.user_metadata?.full_name ?? user.user_metadata?.display_name ?? user.email ?? 'Account'
  const avatarUrl = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null

  return (
    <AppShell
      title="Find a trainer"
      eyebrow="Coaching"
      currentPath="/trainers"
      userName={userName}
      avatarUrl={avatarUrl}
      navigation={buildAppNavigation({
        traineeNotifications: notifications.trainee,
        trainerNotifications: notifications.trainer,
        showTrainerTools: relationships.some((relationship) => relationship.my_role === 'trainer'),
      })}
      actions={(
        <Link href="/connections" className="inline-flex min-h-11 items-center rounded-xl border border-zinc-300 bg-white px-3.5 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
          My connections
        </Link>
      )}
    >
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Approved professionals</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">Personal trainers</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Find a coaching style that fits. Every listing is administrator-approved; connecting never shares your results automatically.
            </p>
          </div>

          <form action="/trainers" method="get" role="search" className="mt-6 grid gap-3 rounded-[1.5rem] border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2 sm:p-5">
            <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200 sm:col-span-2">
              Find a trainer
              <input type="search" name="q" defaultValue={first(params.q)} maxLength={100} placeholder="Name, specialty, or location" className="min-h-12 rounded-xl border border-zinc-300 bg-white px-4 text-zinc-950 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white" />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Specialty
              <input name="specialty" defaultValue={first(params.specialty)} maxLength={40} placeholder="e.g. strength training" className="min-h-12 rounded-xl border border-zinc-300 bg-white px-4 text-zinc-950 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white" />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Availability
              <select name="remote" defaultValue={first(params.remote)} className="min-h-12 rounded-xl border border-zinc-300 bg-white px-4 text-zinc-950 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white">
                <option value="">Any location</option>
                <option value="true">Remote available</option>
                <option value="false">In-person only</option>
              </select>
            </label>
            <button type="submit" className="min-h-12 rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-orange-700 sm:col-span-2">Search trainers</button>
          </form>

          {validationMessage && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{validationMessage}</p>}
          {!validationMessage && <p className="mt-5 text-sm font-medium text-zinc-500 dark:text-zinc-400" aria-live="polite">{trainers.length === 0 ? 'No approved trainers match these filters.' : `${trainers.length} trainer${trainers.length === 1 ? '' : 's'} on this page`}</p>}

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {trainers.map((trainer) => <TrainerCard key={trainer.id} trainer={trainer} />)}
          </div>

          {(page > 1 || hasNextPage) && (
            <nav aria-label="Trainer directory pages" className="mt-6 flex items-center justify-between">
              {page > 1 ? <Link href={pageHref(params, page - 1)} className="inline-flex min-h-11 items-center text-sm font-bold text-orange-700">← Previous</Link> : <span />}
              {hasNextPage && <Link href={pageHref(params, page + 1)} className="inline-flex min-h-11 items-center text-sm font-bold text-orange-700">Next →</Link>}
            </nav>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-[1.4rem] border border-orange-200 bg-orange-50 p-5 dark:border-orange-900/70 dark:bg-orange-950/30">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700 dark:text-orange-300">How it works</p>
            <ol className="mt-4 flex flex-col gap-4 text-sm text-orange-950 dark:text-orange-100">
              <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-600 text-xs font-black text-white">1</span><span>Choose an approved trainer.</span></li>
              <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-600 text-xs font-black text-white">2</span><span>Both people accept the connection.</span></li>
              <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-600 text-xs font-black text-white">3</span><span>You decide whether results are shared.</span></li>
            </ol>
          </section>
          <Link href="/trainers/apply" className="flex min-h-14 items-center justify-between rounded-2xl border border-zinc-200 bg-white px-5 text-sm font-bold text-zinc-800 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">Create a trainer profile <span aria-hidden="true">→</span></Link>
        </aside>
      </div>
    </AppShell>
  )
}
