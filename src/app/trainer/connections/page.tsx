import Link from 'next/link'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import ConnectionCard from '@/app/connections/ConnectionCard'
import { buildAppNavigation } from '@/lib/appNavigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import { listMyTrainerRelationships } from '@/lib/trainerRelationshipDal'
import { countTrainerRelationshipNotifications } from '@/lib/trainerRelationshipNotifications'

export default async function TrainerConnectionsPage() {
  const { user } = await getServerAuthContext()
  if (!user) redirect('/')

  const allRelationships = await listMyTrainerRelationships()
  const relationships = allRelationships.filter((relationship) => relationship.my_role === 'trainer')
  const notifications = countTrainerRelationshipNotifications(allRelationships)
  const pending = relationships.filter((relationship) => relationship.status === 'pending')
  const active = relationships.filter((relationship) => relationship.status === 'active')
  const past = relationships.filter((relationship) => !pending.includes(relationship) && !active.includes(relationship))
  const userName = user.user_metadata?.full_name ?? user.user_metadata?.display_name ?? user.email ?? 'Account'
  const avatarUrl = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null

  return (
    <AppShell
      title="Connection requests"
      eyebrow="Trainer workspace"
      currentPath="/trainer/clients"
      userName={userName}
      avatarUrl={avatarUrl}
      navigation={buildAppNavigation({ traineeNotifications: notifications.trainee, trainerNotifications: notifications.trainer, showTrainerTools: true })}
      actions={<Link href="/trainer/clients" className="inline-flex min-h-11 items-center rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700">Clients</Link>}
      maxWidth="max-w-4xl"
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Mutual consent</p>
        <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">Trainer connections</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">Accepting creates a planning connection only. Results remain private until the trainee grants a specific category.</p>
      </div>

      {pending.length > 0 && (
        <section aria-labelledby="pending-requests-title" className="mt-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 id="pending-requests-title" className="text-base font-black text-zinc-950 dark:text-white">Needs your response</h3>
            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-800 dark:bg-orange-950 dark:text-orange-200">{pending.length}</span>
          </div>
          <div className="flex flex-col gap-4">{pending.map((relationship) => <ConnectionCard key={relationship.relationship_id} relationship={relationship} />)}</div>
        </section>
      )}

      {active.length > 0 && (
        <section aria-labelledby="active-connections-title" className="mt-8">
          <h3 id="active-connections-title" className="mb-4 text-base font-black text-zinc-950 dark:text-white">Active connections</h3>
          <div className="flex flex-col gap-4">{active.map((relationship) => <ConnectionCard key={relationship.relationship_id} relationship={relationship} />)}</div>
        </section>
      )}

      {pending.length === 0 && active.length === 0 && (
        <section className="mt-7 rounded-[1.5rem] border border-dashed border-zinc-300 bg-white/60 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/60">
          <p className="text-base font-bold text-zinc-900 dark:text-white">No trainee requests or connections yet.</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500 dark:text-zinc-400">Publish your approved profile and enable new clients when you are ready.</p>
          <Link href="/trainers/apply" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-orange-600 px-5 text-sm font-bold text-white hover:bg-orange-700">Manage trainer profile</Link>
        </section>
      )}

      {past.length > 0 && <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-400">{past.length} past connection{past.length === 1 ? '' : 's'} remain available through their consent history.</p>}
    </AppShell>
  )
}
