import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { buildAppNavigation } from '@/lib/appNavigation'
import { isAuthorizationDenied } from '@/lib/dataAccessError'
import { getUserTemplates } from '@/lib/dal'
import { dateNDaysAfter, dateNDaysBefore, localDateStr } from '@/lib/localDate'
import { getServerAuthContext } from '@/lib/serverAuth'
import { listTrainerRelationshipPlans } from '@/lib/trainerPlanningDal'
import {
  listTrainerBodyweights,
  listTrainerCompletedWorkouts,
  listTrainerCompletedWorkoutSets,
  type TrainerCompletedWorkoutSet,
} from '@/lib/trainerResultDal'
import { getMyTrainerRelationship, listMyTrainerRelationships } from '@/lib/trainerRelationshipDal'
import { countTrainerRelationshipNotifications } from '@/lib/trainerRelationshipNotifications'
import { isUuid } from '@/lib/trainerValidation'
import ScheduleWorkoutDialog from './ScheduleWorkoutDialog'

type ClientView = 'overview' | 'calendar' | 'results'

function parseView(value: string | string[] | undefined): ClientView {
  const first = Array.isArray(value) ? value[0] : value
  return first === 'calendar' || first === 'results' ? first : 'overview'
}

function displayMetric(set: TrainerCompletedWorkoutSet) {
  const parts = [
    set.weight != null ? `${set.weight} kg` : null,
    set.reps != null ? `${set.reps} reps` : null,
    set.duration_minutes != null ? `${set.duration_minutes} min` : null,
    set.distance != null ? `${set.distance} km` : null,
  ].filter(Boolean)
  return parts.join(' · ') || 'Recorded set'
}

export default async function TrainerClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string | string[] }>
}) {
  const { user, supabase } = await getServerAuthContext()
  if (!user) redirect('/')

  const { id } = await params
  if (!isUuid(id)) notFound()
  const relationship = await getMyTrainerRelationship(id)
  if (!relationship || relationship.my_role !== 'trainer') notFound()

  const [allRelationships, adminResult] = await Promise.all([
    listMyTrainerRelationships(),
    supabase.rpc('current_user_is_platform_admin'),
  ])
  const notifications = countTrainerRelationshipNotifications(allRelationships)
  const view = parseView((await searchParams).view)
  const active = relationship.status === 'active'
  const today = localDateStr()
  const resultFrom = dateNDaysBefore(today, 365)
  const planTo = dateNDaysAfter(today, 180)

  const [templates, plans] = active
    ? await Promise.all([
        getUserTemplates(),
        listTrainerRelationshipPlans(relationship.relationship_id, today, planTo),
      ])
    : [[], []]

  let completedWorkouts: Awaited<ReturnType<typeof listTrainerCompletedWorkouts>> = []
  let workoutSets = new Map<number, TrainerCompletedWorkoutSet[]>()
  let bodyweights: Awaited<ReturnType<typeof listTrainerBodyweights>> = []
  let workoutReadDenied = false
  let bodyweightReadDenied = false
  let workoutReadFailed = false
  let bodyweightReadFailed = false

  if (active && relationship.workout_results_access && view !== 'calendar') {
    try {
      completedWorkouts = await listTrainerCompletedWorkouts(
        relationship.relationship_id,
        resultFrom,
        today,
      )
      const detailRows = await Promise.all(
        completedWorkouts.slice(0, 10).map((workout) =>
          listTrainerCompletedWorkoutSets(relationship.relationship_id, workout.id),
        ),
      )
      workoutSets = new Map(
        completedWorkouts.slice(0, 10).map((workout, index) => [workout.id, detailRows[index]]),
      )
    } catch (error) {
      if (isAuthorizationDenied(error)) workoutReadDenied = true
      else workoutReadFailed = true
      completedWorkouts = []
      workoutSets = new Map()
    }
  }

  if (active && relationship.bodyweight_access && view !== 'calendar') {
    try {
      bodyweights = await listTrainerBodyweights(
        relationship.relationship_id,
        resultFrom,
        today,
      )
    } catch (error) {
      if (isAuthorizationDenied(error)) bodyweightReadDenied = true
      else bodyweightReadFailed = true
      bodyweights = []
    }
  }

  // A consent mutation can commit between the relationship summary and the
  // audited result RPC. Treat the RPC's authorization denial as authoritative.
  const workoutResultsShared = relationship.workout_results_access && !workoutReadDenied
  const bodyweightShared = relationship.bodyweight_access && !bodyweightReadDenied

  const userName = user.user_metadata?.full_name ?? user.user_metadata?.display_name ?? user.email ?? 'Account'
  const avatarUrl = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null
  const tabHref = (tab: ClientView) => tab === 'overview'
    ? `/trainer/clients/${relationship.relationship_id}`
    : `/trainer/clients/${relationship.relationship_id}?view=${tab}`

  return (
    <AppShell
      title={relationship.counterparty_display_name}
      eyebrow="Client workspace"
      currentPath="/trainer/clients"
      userName={userName}
      avatarUrl={avatarUrl}
      navigation={buildAppNavigation({
        traineeNotifications: notifications.trainee,
        trainerNotifications: notifications.trainer,
        showTrainerTools: true,
        isPlatformAdmin: !adminResult.error && adminResult.data === true,
      })}
      actions={active ? (
        <ScheduleWorkoutDialog
          relationshipId={relationship.relationship_id}
          traineeName={relationship.counterparty_display_name}
          templates={templates}
        />
      ) : undefined}
    >
      <Link href="/trainer/clients" className="mb-5 inline-flex min-h-11 items-center text-sm font-bold text-zinc-500 hover:text-zinc-950 dark:hover:text-white">
        <span aria-hidden="true" className="mr-1">←</span> All clients
      </Link>

      {!active ? (
        <section className="rounded-[1.6rem] border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Connection {relationship.status}</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-zinc-950 dark:text-white">
            {relationship.status === 'pending' ? 'Access pending' : 'Access ended'}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {relationship.status === 'pending'
              ? 'Both people must accept before planning becomes available. No health or workout data is visible while this request is pending.'
              : 'This client workspace is closed. New planning and result reads are blocked; plans already delivered remain owned by the trainee.'}
          </p>
          <Link href="/trainer/connections" className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
            View connection history
          </Link>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Client access overview">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Connection</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Active</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Workout results</p>
              <p className={`mt-2 text-sm font-bold ${workoutResultsShared ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-600 dark:text-zinc-300'}`}>{workoutResultsShared ? 'Shared' : 'Private'}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Bodyweight</p>
              <p className={`mt-2 text-sm font-bold ${bodyweightShared ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-600 dark:text-zinc-300'}`}>{bodyweightShared ? 'Shared' : 'Private'}</p>
            </div>
          </section>

          <nav aria-label="Client workspace views" className="mt-6 flex gap-1 overflow-x-auto rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
            {(['overview', 'calendar', 'results'] as const).map((tab) => (
              <Link
                key={tab}
                href={tabHref(tab)}
                aria-current={view === tab ? 'page' : undefined}
                className={`inline-flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-4 text-sm font-bold capitalize transition ${view === tab ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-500 hover:text-zinc-950 dark:hover:text-white'}`}
              >
                {tab}
              </Link>
            ))}
          </nav>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,.75fr)]">
            {(view === 'overview' || view === 'calendar') && (
              <section aria-labelledby="client-calendar-title" className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Next 6 months</p>
                    <h2 id="client-calendar-title" className="mt-1 text-xl font-black tracking-tight text-zinc-950 dark:text-white">Client calendar</h2>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{plans.length}</span>
                </div>

                {plans.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">No upcoming assignments</p>
                    <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Schedule from one of your templates. The trainee receives a fixed snapshot.</p>
                  </div>
                ) : (
                  <ol className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800">
                    {plans.map((plan) => (
                      <li key={plan.plan_id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <time dateTime={plan.scheduled_date} className="w-24 shrink-0 text-xs font-bold text-zinc-500 dark:text-zinc-400">{plan.scheduled_date}</time>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-zinc-950 dark:text-white">{plan.title}</p>
                          <p className="mt-0.5 text-xs capitalize text-zinc-500">{plan.status} · {plan.exercise_count} exercises</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}

            {(view === 'overview' || view === 'results') && (
              <section aria-labelledby="completed-workouts-title" className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Consent-scoped</p>
                  <h2 id="completed-workouts-title" className="mt-1 text-xl font-black tracking-tight text-zinc-950 dark:text-white">Completed workouts</h2>
                </div>

                {!workoutResultsShared ? (
                  <div className="mt-5 rounded-2xl bg-zinc-50 p-5 dark:bg-zinc-950">
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white">Results are not shared</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">The trainee has not granted completed-workout access, or it was revoked. In-progress sessions are never available.</p>
                  </div>
                ) : workoutReadFailed ? (
                  <div role="alert" className="mt-5 rounded-2xl bg-red-50 p-5 dark:bg-red-950/50">
                    <h3 className="text-base font-bold text-red-900 dark:text-red-100">Results temporarily unavailable</h3>
                    <p className="mt-2 text-sm leading-6 text-red-700 dark:text-red-200">Access is still enabled, but the results could not be loaded. Refresh before making a coaching decision.</p>
                  </div>
                ) : completedWorkouts.length === 0 ? (
                  <p className="mt-5 rounded-2xl border border-dashed border-zinc-300 p-5 text-sm leading-6 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">Access is active, but there are no completed workouts in the shared date range.</p>
                ) : (
                  <div className="mt-5 flex flex-col gap-3">
                    {completedWorkouts.slice(0, 10).map((workout) => (
                      <article key={workout.id} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-bold text-zinc-950 dark:text-white">{workout.title || `Workout · ${workout.date}`}</h3>
                            <time dateTime={workout.date} className="mt-1 block text-xs text-zinc-500">{workout.date}</time>
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Completed</span>
                        </div>
                        <ul className="mt-3 flex flex-col gap-2">
                          {(workoutSets.get(workout.id) ?? []).map((set) => (
                            <li key={`${set.exercise_id}-${set.set_number}`} className="flex items-baseline justify-between gap-3 text-sm">
                              <span className="min-w-0 truncate font-medium text-zinc-800 dark:text-zinc-200">{set.exercise_name} · set {set.set_number}</span>
                              <span className="shrink-0 text-xs text-zinc-500">{displayMetric(set)}</span>
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {(view === 'overview' || view === 'results') && (
              <section aria-labelledby="bodyweight-title" className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6 lg:col-start-2">
                <h2 id="bodyweight-title" className="text-lg font-black tracking-tight text-zinc-950 dark:text-white">Bodyweight</h2>
                {!bodyweightShared ? (
                  <div className="mt-4 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Bodyweight is not shared</h3>
                    <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">This requires its own active permission.</p>
                  </div>
                ) : bodyweightReadFailed ? (
                  <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 dark:bg-red-950/50">
                    <h3 className="text-sm font-bold text-red-900 dark:text-red-100">Bodyweight temporarily unavailable</h3>
                    <p className="mt-1 text-xs leading-5 text-red-700 dark:text-red-200">Access is still enabled, but measurements could not be loaded. Try refreshing.</p>
                  </div>
                ) : bodyweights.length === 0 ? (
                  <p className="mt-4 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Access is active, but there are no measurements in the shared range.</p>
                ) : (
                  <dl className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
                    {bodyweights.slice(0, 12).map((measurement) => (
                      <div key={measurement.date} className="flex items-center justify-between py-2.5">
                        <dt className="text-xs text-zinc-500">{measurement.date}</dt>
                        <dd className="text-sm font-bold text-zinc-900 dark:text-white">{measurement.weight} kg</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </AppShell>
  )
}
