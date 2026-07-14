import { redirect } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getMonthWorkoutsWithPreviews, getUserTemplates, getRecentBodyWeights } from '@/lib/dal'
import { buildAppNavigation } from '@/lib/appNavigation'
import { dateNDaysAfter, localDateStr } from '@/lib/localDate'
import { listAttributedWorkoutPlanDetails } from '@/lib/trainerPlanningDal'
import { listMyTrainerRelationships } from '@/lib/trainerRelationshipDal'
import {
  countTrainerRelationshipNotifications,
  trainerNotificationLabel,
} from '@/lib/trainerRelationshipNotifications'
import CalendarView from '@/app/workouts/CalendarView'
import BodyweightCard from './BodyweightCard'
import StartWorkoutButton from './StartWorkoutButton'
import WorkoutPlanAgenda from './WorkoutPlanAgenda'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { y, m } = await searchParams
  const now = new Date()
  const year = y ? Number(y) : now.getFullYear()
  const month = m ? Number(m) : now.getMonth() + 1

  const [
    { entries: workouts, previews: initialPreviews },
    templates,
    bodyWeights,
    adminResult,
    trainerRelationships,
  ] = await Promise.all([
    getMonthWorkoutsWithPreviews(year, month),
    getUserTemplates(),
    getRecentBodyWeights(),
    supabase.rpc('current_user_is_platform_admin'),
    listMyTrainerRelationships(),
  ])
  const isPlatformAdmin = !adminResult.error && adminResult.data === true
  const trainerNotifications = countTrainerRelationshipNotifications(trainerRelationships)
  const hasTrainerRole = trainerRelationships.some(
    (relationship) => relationship.my_role === 'trainer',
  )
  const today = localDateStr()
  let workoutPlans: Awaited<ReturnType<typeof listAttributedWorkoutPlanDetails>> = []
  let planReadFailed = false
  try {
    workoutPlans = await listAttributedWorkoutPlanDetails(
      today,
      dateNDaysAfter(today, 120),
      trainerRelationships,
    )
  } catch {
    planReadFailed = true
  }

  const name = user.user_metadata?.full_name ?? user.user_metadata?.display_name ?? user.email ?? 'Athlete'
  const firstName = String(name).split(/\s|@/)[0]
  const avatar = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null
  const myPtLabel = trainerNotificationLabel('My PT', trainerNotifications.trainee)
  const ptRequestsLabel = trainerNotificationLabel('PT Requests', trainerNotifications.trainer)

  return (
    <AppShell
      title="Today"
      eyebrow="Workout tracker"
      currentPath="/dashboard"
      userName={name}
      avatarUrl={avatar}
      navigation={buildAppNavigation({
        traineeNotifications: trainerNotifications.trainee,
        trainerNotifications: trainerNotifications.trainer,
        showTrainerTools: hasTrainerRole,
        isPlatformAdmin,
      })}
    >
      <section className="overflow-hidden rounded-[1.75rem] bg-zinc-950 p-6 text-white shadow-xl shadow-zinc-950/10 dark:bg-zinc-900 sm:p-8">
        <div className="grid items-end gap-7 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">{new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] sm:text-4xl">{greeting()}, {firstName}.</h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-300">Start today’s session, or review the plan your trainer prepared before you move.</p>
          </div>
          <StartWorkoutButton />
        </div>
      </section>

      <section aria-labelledby="quick-actions-title" className="mt-6">
        <h2 id="quick-actions-title" className="sr-only">Quick actions</h2>
        <div className={`grid grid-cols-2 gap-3 ${hasTrainerRole ? 'sm:grid-cols-3 lg:grid-cols-5' : 'sm:grid-cols-3'}`}>
          <Link href="/workouts" className="flex min-h-20 flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-900 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-white">
            <span aria-hidden="true" className="text-xl text-orange-600">◫</span>
            Workout plans
          </Link>
          <Link href="/routines" className="flex min-h-20 flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-900 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-white">
            <span aria-hidden="true" className="text-xl text-orange-600">⌁</span>
            Exercise library
          </Link>
          <Link href="/connections" className="relative flex min-h-20 flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-900 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-white">
            <span aria-hidden="true" className="text-xl text-orange-600">◎</span>
            {myPtLabel}
          </Link>
          {hasTrainerRole && (
            <>
              <Link href="/trainer/connections" className="relative flex min-h-20 flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-900 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-white">
                <span aria-hidden="true" className="text-xl text-orange-600">◇</span>
                {ptRequestsLabel}
              </Link>
              <Link href="/trainer/clients" className="relative flex min-h-20 flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-900 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-white">
                <span aria-hidden="true" className="text-xl text-orange-600">◉</span>
                Clients
              </Link>
            </>
          )}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,.75fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <WorkoutPlanAgenda plans={workoutPlans} loadFailed={planReadFailed} />

          <section aria-labelledby="training-calendar-heading" className="rounded-[1.5rem] border border-zinc-200/80 bg-white p-5 shadow-sm shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Training history</p>
              <h2 id="training-calendar-heading" className="mt-1 text-xl font-black tracking-tight text-zinc-950 dark:text-white">Calendar</h2>
            </div>
            <CalendarView
              year={year}
              month={month}
              workouts={workouts}
              initialPreviews={initialPreviews}
              basePath="/dashboard"
              initialTemplates={templates}
            />
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="bodyweight-heading" className="rounded-[1.5rem] border border-zinc-200/80 bg-white p-5 shadow-sm shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Progress marker</p>
              <h2 id="bodyweight-heading" className="mt-1 text-xl font-black tracking-tight text-zinc-950 dark:text-white">Bodyweight</h2>
            </div>
            <BodyweightCard initial={bodyWeights} />
          </section>

          <section className="rounded-[1.5rem] border border-orange-200 bg-orange-50 p-5 dark:border-orange-900/70 dark:bg-orange-950/30">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-300">Coaching</p>
            <h2 className="mt-2 text-lg font-black tracking-tight text-orange-950 dark:text-orange-100">Train with support</h2>
            <p className="mt-2 text-sm leading-6 text-orange-900/80 dark:text-orange-200/80">Find an approved trainer, connect by mutual consent, and choose exactly which completed results they may see.</p>
            <Link href="/trainers" className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-orange-800 hover:text-orange-950 dark:text-orange-200 dark:hover:text-white">
              Find a trainer <span aria-hidden="true" className="ml-1">→</span>
            </Link>
          </section>

          {isPlatformAdmin && (
            <Link href="/admin/trainers" className="inline-flex min-h-12 items-center justify-between rounded-2xl border border-zinc-200 bg-white px-5 text-sm font-bold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
              Trainer administration <span aria-hidden="true">→</span>
            </Link>
          )}
        </aside>
      </div>
    </AppShell>
  )
}
