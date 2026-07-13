import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import {
  getMyTrainerRelationship,
  listTrainerRelationshipAudit,
} from '@/lib/trainerRelationshipDal'
import { isUuid } from '@/lib/trainerValidation'

const eventLabels: Record<string, string> = {
  'relationship.requested': 'Connection requested',
  'relationship.accepted': 'Request accepted',
  'relationship.activated': 'Connection activated',
  'relationship.declined': 'Request declined',
  'relationship.ended': 'Connection ended',
  'access.granted': 'Sharing permission granted',
  'access.revoked': 'Sharing permission revoked',
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
  const relationship = await getMyTrainerRelationship(id)
  if (!relationship) notFound()
  const events = await listTrainerRelationshipAudit(id)
  const backHref = relationship.my_role === 'trainer' ? '/trainer/connections' : '/connections'

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <Link href={backHref} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
            ← Connections
          </Link>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Consent history</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
            {relationship.counterparty_display_name}
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Append-only history of connection and permission changes. Account IDs and private health data are not included.
          </p>
        </div>

        <ol className="mt-8 flex flex-col gap-3">
          {events.map((event, index) => {
            const permission = typeof event.details.permission === 'string'
              ? event.details.permission.replace('workout_results.read', 'completed workout results').replace('bodyweight.read', 'bodyweight history')
              : null
            return (
              <li key={`${event.occurred_at}-${event.event_type}-${index}`} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                      {eventLabels[event.event_type] ?? event.event_type}
                    </h3>
                    <p className="mt-1 text-xs capitalize text-zinc-500">
                      By {event.actor_role}{permission ? ` · ${permission}` : ''}
                    </p>
                  </div>
                  <time dateTime={event.occurred_at} className="text-xs text-zinc-500">
                    {new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.occurred_at))}
                  </time>
                </div>
              </li>
            )
          })}
        </ol>
      </main>
    </div>
  )
}
