import Link from 'next/link'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { buildAppNavigation } from '@/lib/appNavigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import { getOwnTrainerProfile } from '@/lib/trainerDal'
import { listMyTrainerRelationships } from '@/lib/trainerRelationshipDal'
import { countTrainerRelationshipNotifications } from '@/lib/trainerRelationshipNotifications'
import TrainerProfileForm from './TrainerProfileForm'

export default async function TrainerApplicationPage() {
  const { user } = await getServerAuthContext()
  if (!user) redirect('/')

  const [profile, relationships] = await Promise.all([
    getOwnTrainerProfile(),
    listMyTrainerRelationships(),
  ])
  const notifications = countTrainerRelationshipNotifications(relationships)
  const metadataName = typeof user.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name
    : typeof user.user_metadata?.display_name === 'string'
      ? user.user_metadata.display_name
      : ''
  const userName = metadataName || user.email || 'Account'
  const avatarUrl = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null

  return (
    <AppShell
      title="Trainer profile"
      eyebrow="Coaching"
      currentPath="/trainers"
      userName={userName}
      avatarUrl={avatarUrl}
      navigation={buildAppNavigation({ traineeNotifications: notifications.trainee, trainerNotifications: notifications.trainer, showTrainerTools: Boolean(profile) || relationships.some((relationship) => relationship.my_role === 'trainer') })}
      actions={<Link href="/trainers" className="inline-flex min-h-11 items-center text-sm font-bold text-zinc-500 hover:text-zinc-950 dark:hover:text-white">← Directory</Link>}
      maxWidth="max-w-4xl"
    >
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Public listing</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">{profile ? 'Manage your trainer profile' : 'Become a trainer'}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">Build a clear, trustworthy listing. It becomes discoverable only after administrator approval and while you choose to publish it.</p>
          </div>
          <div className="mt-6 rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-7">
            <TrainerProfileForm profile={profile} defaultDisplayName={metadataName} />
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-[1.4rem] border border-orange-200 bg-orange-50 p-5 dark:border-orange-900/70 dark:bg-orange-950/30">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700 dark:text-orange-300">Before publishing</p>
            <ul className="mt-4 flex flex-col gap-3 text-sm leading-6 text-orange-950 dark:text-orange-100">
              <li>Use a recognizable public name.</li>
              <li>Describe your coaching approach and specialties.</li>
              <li>Keep private contact details out of the bio.</li>
            </ul>
          </section>
          <section className="rounded-[1.4rem] border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-sm font-black text-zinc-950 dark:text-white">Safety by design</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Approval makes a profile discoverable. It never grants access to anyone’s workout or bodyweight data.</p>
          </section>
        </aside>
      </div>
    </AppShell>
  )
}
