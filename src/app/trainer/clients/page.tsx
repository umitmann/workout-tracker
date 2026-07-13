import Link from 'next/link'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { buildAppNavigation } from '@/lib/appNavigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import { listMyTrainerRelationships } from '@/lib/trainerRelationshipDal'
import { countTrainerRelationshipNotifications, trainerNotificationLabel } from '@/lib/trainerRelationshipNotifications'

export default async function TrainerClientsPage() {
  const { user, supabase } = await getServerAuthContext()
  if (!user) redirect('/')

  const [relationships, adminResult] = await Promise.all([
    listMyTrainerRelationships(),
    supabase.rpc('current_user_is_platform_admin'),
  ])
  const trainerRelationships = relationships.filter(
    (relationship) => relationship.my_role === 'trainer',
  )
  const active = trainerRelationships.filter((relationship) => relationship.status === 'active')
  const past = trainerRelationships.filter((relationship) => ['ended', 'declined', 'expired'].includes(relationship.status))
  const notifications = countTrainerRelationshipNotifications(relationships)
  const userName = user.user_metadata?.full_name ?? user.user_metadata?.display_name ?? user.email ?? 'Account'
  const avatarUrl = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null

  return (
    <AppShell
      title="Clients"
      eyebrow="Trainer workspace"
      currentPath="/trainer/clients"
      userName={userName}
      avatarUrl={avatarUrl}
      navigation={buildAppNavigation({
        traineeNotifications: notifications.trainee,
        trainerNotifications: notifications.trainer,
        showTrainerTools: true,
        isPlatformAdmin: !adminResult.error && adminResult.data === true,
      })}
      actions={(
        <Link
          href="/trainer/connections"
          className="inline-flex min-h-11 items-center rounded-xl border border-zinc-300 bg-white px-3.5 text-sm font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          {trainerNotificationLabel('PT Requests', notifications.trainer)}
        </Link>
      )}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="active-clients-title" className="min-w-0">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="active-clients-title" className="text-2xl font-black tracking-tight text-zinc-950 dark:text-white">Active clients</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Schedule immutable workout prescriptions and review only the results each client has chosen to share.
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{active.length}</span>
          </div>

          {active.length > 0 ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {active.map((relationship) => (
                <article key={relationship.relationship_id} className="rounded-[1.4rem] border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-start gap-3">
                    {relationship.counterparty_avatar_url ? (
                      // Relationship DTO contains an explicitly shareable avatar URL only.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={relationship.counterparty_avatar_url} alt="" className="h-12 w-12 rounded-2xl object-cover" />
                    ) : (
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange-100 text-base font-black text-orange-800 dark:bg-orange-950 dark:text-orange-200">
                        {relationship.counterparty_display_name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-bold text-zinc-950 dark:text-white">
                        <Link href={`/trainer/clients/${relationship.relationship_id}`} className="hover:text-orange-700 dark:hover:text-orange-300">
                          {relationship.counterparty_display_name}
                        </Link>
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Connected {relationship.activated_at?.slice(0, 10)}</p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2" aria-label="Shared result categories">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${relationship.workout_results_access ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                      Results {relationship.workout_results_access ? 'shared' : 'private'}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${relationship.bodyweight_access ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                      Bodyweight {relationship.bodyweight_access ? 'shared' : 'private'}
                    </span>
                  </div>

                  <Link href={`/trainer/clients/${relationship.relationship_id}`} className="mt-5 inline-flex min-h-11 items-center text-sm font-bold text-orange-700 hover:text-orange-900 dark:text-orange-300">
                    Open client workspace <span aria-hidden="true" className="ml-1">→</span>
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-[1.4rem] border border-dashed border-zinc-300 bg-white/60 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/60">
              <p className="text-base font-bold text-zinc-900 dark:text-white">No active clients yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500 dark:text-zinc-400">Accept an incoming request to open a private client workspace. Connecting alone never exposes health data.</p>
              <Link href="/trainer/connections" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-orange-600 px-5 text-sm font-bold text-white hover:bg-orange-700">
                Review requests
              </Link>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-[1.4rem] border border-orange-200 bg-orange-50 p-5 dark:border-orange-900/70 dark:bg-orange-950/30">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700 dark:text-orange-300">Privacy boundary</p>
            <h2 className="mt-2 text-base font-black text-orange-950 dark:text-orange-100">Consent is not connection</h2>
            <p className="mt-2 text-sm leading-6 text-orange-900/80 dark:text-orange-200/80">A client can receive your plans without sharing results. Workout and bodyweight access remain separate and revocable.</p>
          </section>

          <section className="rounded-[1.4rem] border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-bold text-zinc-950 dark:text-white">Trainer tools</h2>
            <nav aria-label="Trainer tools" className="mt-3 flex flex-col">
              <Link href="/trainer/connections" className="flex min-h-11 items-center justify-between border-b border-zinc-100 text-sm font-semibold text-zinc-700 hover:text-orange-700 dark:border-zinc-800 dark:text-zinc-300">
                Requests <span aria-hidden="true">→</span>
              </Link>
              <Link href="/trainers/apply" className="flex min-h-11 items-center justify-between text-sm font-semibold text-zinc-700 hover:text-orange-700 dark:text-zinc-300">
                Public profile <span aria-hidden="true">→</span>
              </Link>
            </nav>
          </section>

          {past.length > 0 && (
            <p className="px-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{past.length} past connection{past.length === 1 ? '' : 's'} remain available in the consent audit.</p>
          )}
        </aside>
      </div>
    </AppShell>
  )
}
