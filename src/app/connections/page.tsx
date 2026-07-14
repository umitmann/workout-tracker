import Link from 'next/link'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { buildAppNavigation } from '@/lib/appNavigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import { listMyTrainerRelationships } from '@/lib/trainerRelationshipDal'
import { countTrainerRelationshipNotifications } from '@/lib/trainerRelationshipNotifications'
import ConnectionCard from './ConnectionCard'

export default async function TraineeConnectionsPage() {
  const { user } = await getServerAuthContext()
  if (!user) redirect('/')

  const allRelationships = await listMyTrainerRelationships()
  const relationships = allRelationships.filter((relationship) => relationship.my_role === 'trainee')
  const notifications = countTrainerRelationshipNotifications(allRelationships)
  const current = relationships.filter((relationship) => relationship.status === 'pending' || relationship.status === 'active')
  const historic = relationships.filter((relationship) => !current.includes(relationship))
  const featured = current.length > 0 ? current : historic.slice(0, 1)
  const past = current.length > 0 ? historic : historic.slice(1)
  const userName = user.user_metadata?.full_name ?? user.user_metadata?.display_name ?? user.email ?? 'Account'
  const avatarUrl = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null

  return (
    <AppShell
      title="My trainer"
      eyebrow="Coaching"
      currentPath="/connections"
      userName={userName}
      avatarUrl={avatarUrl}
      navigation={buildAppNavigation({ traineeNotifications: notifications.trainee, trainerNotifications: notifications.trainer, showTrainerTools: allRelationships.some((relationship) => relationship.my_role === 'trainer') })}
      actions={<Link href="/trainers" className="inline-flex min-h-11 items-center rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700">Find a trainer</Link>}
      maxWidth="max-w-4xl"
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Connection & privacy</p>
        <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">Connections and consent</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">A connection enables scheduling. Your completed workouts and bodyweight stay private until you enable each category, and revocation applies immediately.</p>
      </div>

      {featured.length > 0 ? (
        <section aria-labelledby="current-connections-title" className="mt-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 id="current-connections-title" className="text-base font-black text-zinc-950 dark:text-white">
              {current.length > 0 ? 'Current' : 'Recently closed'}
            </h3>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{featured.length}</span>
          </div>
          <div className="flex flex-col gap-4">{featured.map((relationship) => <ConnectionCard key={relationship.relationship_id} relationship={relationship} />)}</div>
        </section>
      ) : (
        <section className="mt-7 rounded-[1.5rem] border border-dashed border-zinc-300 bg-white/60 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/60">
          <p className="text-base font-bold text-zinc-900 dark:text-white">You have no trainer connections yet.</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500 dark:text-zinc-400">Browse approved trainers and send a request. Nothing is shared until both people accept—and results stay off after that.</p>
          <Link href="/trainers" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-orange-600 px-5 text-sm font-bold text-white hover:bg-orange-700">Browse trainers</Link>
        </section>
      )}

      {past.length > 0 && (
        <section aria-labelledby="past-connections-title" className="mt-9">
          <h3 id="past-connections-title" className="mb-4 text-base font-black text-zinc-950 dark:text-white">Past connections</h3>
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {past.map((relationship) => (
              <li key={relationship.relationship_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-zinc-950 dark:text-white">{relationship.counterparty_display_name}</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Closed {relationship.ended_at?.slice(0, 10) ?? relationship.created_at.slice(0, 10)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold capitalize text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{relationship.status}</span>
                  <Link
                    href={`/connections/${relationship.relationship_id}`}
                    aria-label={`View consent history for ${relationship.counterparty_display_name}`}
                    className="inline-flex min-h-11 items-center text-sm font-bold text-orange-700 hover:text-orange-900 dark:text-orange-300"
                  >
                    View history <span aria-hidden="true" className="ml-1">→</span>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  )
}
