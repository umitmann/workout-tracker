import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { buildAppNavigation } from '@/lib/appNavigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import { listMyTrainerRelationships, listTrainerRelationshipAudit } from '@/lib/trainerRelationshipDal'
import { countTrainerRelationshipNotifications } from '@/lib/trainerRelationshipNotifications'
import { isUuid } from '@/lib/trainerValidation'

const eventLabels: Record<string, string> = {
  'relationship.requested': 'Connection requested',
  'relationship.accepted': 'Request accepted',
  'relationship.activated': 'Connection activated',
  'relationship.declined': 'Request declined',
  'relationship.ended': 'Connection ended',
  'access.granted': 'Sharing permission granted',
  'access.revoked': 'Sharing permission revoked',
  'plan.assigned': 'Workout assigned',
  'plan.cancelled': 'Workout cancelled',
  'plan.started': 'Workout started',
  'plan.completed': 'Workout completed',
  'results.workouts_read': 'Completed workouts viewed',
  'results.workout_detail_read': 'Workout detail viewed',
  'results.bodyweight_read': 'Bodyweight history viewed',
}

export default async function TrainerConnectionHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { user } = await getServerAuthContext()
  if (!user) redirect('/')

  const { id } = await params
  if (!isUuid(id)) notFound()
  const relationships = await listMyTrainerRelationships()
  const relationship = relationships.find((item) => item.relationship_id === id)
  if (!relationship) notFound()
  const events = await listTrainerRelationshipAudit(id)
  const notifications = countTrainerRelationshipNotifications(relationships)
  const backHref = relationship.my_role === 'trainer' ? '/trainer/connections' : '/connections'
  const userName = user.user_metadata?.full_name ?? user.user_metadata?.display_name ?? user.email ?? 'Account'
  const avatarUrl = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null

  return (
    <AppShell
      title="Consent history"
      eyebrow="Audit trail"
      currentPath={relationship.my_role === 'trainer' ? '/trainer/clients' : '/connections'}
      userName={userName}
      avatarUrl={avatarUrl}
      navigation={buildAppNavigation({ traineeNotifications: notifications.trainee, trainerNotifications: notifications.trainer, showTrainerTools: relationships.some((item) => item.my_role === 'trainer') })}
      actions={<Link href={backHref} className="inline-flex min-h-11 items-center text-sm font-bold text-zinc-500 hover:text-zinc-950 dark:hover:text-white">← Connections</Link>}
      maxWidth="max-w-3xl"
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">{relationship.status} connection</p>
        <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">{relationship.counterparty_display_name}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">Append-only history of connection, permission, planning, and audited read events. Account IDs and private health payloads are never included.</p>
      </div>

      <ol className="relative mt-8 flex flex-col gap-3 before:absolute before:bottom-6 before:left-[1.15rem] before:top-6 before:w-px before:bg-zinc-200 dark:before:bg-zinc-800">
        {events.map((event, index) => {
          const permission = typeof event.details.permission === 'string'
            ? event.details.permission.replace('workout_results.read', 'completed workout results').replace('bodyweight.read', 'bodyweight history')
            : null
          return (
            <li key={`${event.occurred_at}-${event.event_type}-${index}`} className="relative flex gap-4">
              <span className="relative z-10 mt-4 h-9 w-9 shrink-0 rounded-full border-4 border-[var(--color-canvas)] bg-orange-600 dark:border-[var(--color-canvas)]" aria-hidden="true" />
              <article className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-950 dark:text-white">{eventLabels[event.event_type] ?? event.event_type}</h3>
                    <p className="mt-1 text-xs capitalize text-zinc-500">By {event.actor_role}{permission ? ` · ${permission}` : ''}</p>
                  </div>
                  <time dateTime={event.occurred_at} className="text-xs text-zinc-500">{new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.occurred_at))}</time>
                </div>
              </article>
            </li>
          )
        })}
      </ol>

      {events.length === 0 && <p className="mt-8 rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">No audit events are available for this connection.</p>}
    </AppShell>
  )
}
