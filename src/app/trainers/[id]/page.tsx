import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { buildAppNavigation } from '@/lib/appNavigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import { getDirectoryTrainer, getOwnTrainerProfile } from '@/lib/trainerDal'
import { getMyRelationshipForTrainerProfile, listMyTrainerRelationships } from '@/lib/trainerRelationshipDal'
import { countTrainerRelationshipNotifications } from '@/lib/trainerRelationshipNotifications'
import { isUuid } from '@/lib/trainerValidation'
import RequestTrainingButton from './RequestTrainingButton'

function specialtyLabel(specialty: string) {
  return specialty.replace(/[-_]+/g, ' ')
}

export default async function TrainerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { user } = await getServerAuthContext()
  if (!user) redirect('/')

  const { id } = await params
  if (!isUuid(id)) notFound()
  const [trainer, ownProfile, relationship, relationships] = await Promise.all([
    getDirectoryTrainer(id),
    getOwnTrainerProfile(),
    getMyRelationshipForTrainerProfile(id),
    listMyTrainerRelationships(),
  ])
  if (!trainer) notFound()
  const notifications = countTrainerRelationshipNotifications(relationships)
  const userName = user.user_metadata?.full_name ?? user.user_metadata?.display_name ?? user.email ?? 'Account'
  const avatarUrl = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null

  return (
    <AppShell
      title="Trainer profile"
      eyebrow="Coaching"
      currentPath="/trainers"
      userName={userName}
      avatarUrl={avatarUrl}
      navigation={buildAppNavigation({ traineeNotifications: notifications.trainee, trainerNotifications: notifications.trainer, showTrainerTools: Boolean(ownProfile) || relationships.some((item) => item.my_role === 'trainer') })}
      actions={<Link href="/trainers" className="inline-flex min-h-11 items-center text-sm font-bold text-zinc-500 hover:text-zinc-950 dark:hover:text-white">← Directory</Link>}
      maxWidth="max-w-4xl"
    >
      <article className="overflow-hidden rounded-[1.75rem] border border-zinc-200 bg-white shadow-sm shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="h-28 bg-gradient-to-br from-orange-500 via-orange-600 to-amber-500 sm:h-36" aria-hidden="true" />
        <div className="px-5 pb-7 sm:px-8 sm:pb-8">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-0 items-end gap-4">
              {trainer.avatar_url ? (
                // Directory avatars are explicitly public listing data.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={trainer.avatar_url} alt="" className="h-20 w-20 rounded-[1.4rem] border-4 border-white bg-white object-cover shadow-md dark:border-zinc-900 dark:bg-zinc-900 sm:h-24 sm:w-24" />
              ) : (
                <span className="grid h-20 w-20 place-items-center rounded-[1.4rem] border-4 border-white bg-orange-100 text-2xl font-black text-orange-800 shadow-md dark:border-zinc-900 dark:bg-orange-950 dark:text-orange-200 sm:h-24 sm:w-24">
                  {trainer.display_name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 pb-1">
                <h2 className="truncate text-2xl font-black tracking-tight text-zinc-950 dark:text-white sm:text-3xl">{trainer.display_name}</h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{[trainer.location_text, trainer.remote_available ? 'Remote available' : null].filter(Boolean).join(' · ') || 'Location not specified'}</p>
              </div>
            </div>
            <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${trainer.accepting_clients ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'}`}>{trainer.accepting_clients ? 'Accepting clients' : 'Not accepting clients'}</span>
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">
              <section aria-labelledby="about-heading">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">About</p>
                <h3 id="about-heading" className="sr-only">About {trainer.display_name}</h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-700 dark:text-zinc-300">{trainer.bio || 'This trainer has not added a bio yet.'}</p>
              </section>

              {trainer.specialties.length > 0 && (
                <section className="mt-7" aria-labelledby="specialties-heading">
                  <h3 id="specialties-heading" className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Specialties</h3>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {trainer.specialties.map((specialty) => <li key={specialty} className="rounded-full bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-800 dark:bg-orange-950 dark:text-orange-200">{specialtyLabel(specialty)}</li>)}
                  </ul>
                </section>
              )}
            </div>

            <section className="rounded-[1.4rem] border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-700 dark:bg-zinc-950" aria-labelledby="training-request-heading">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Next step</p>
              <h3 id="training-request-heading" className="mt-2 text-lg font-black text-zinc-950 dark:text-white">Training connection</h3>
              <p className="mb-5 mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Both people must agree. Connecting does not share workouts or bodyweight automatically.</p>
              <RequestTrainingButton trainerProfileId={trainer.id} acceptingClients={trainer.accepting_clients} isOwnProfile={ownProfile?.id === trainer.id} relationship={relationship} />
            </section>
          </div>
        </div>
      </article>
    </AppShell>
  )
}
