import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { buildAppNavigation } from '@/lib/appNavigation'
import { getOwnAccountProfile } from '@/lib/accountDal'
import { getServerAuthContext } from '@/lib/serverAuth'
import { listMyTrainerRelationships } from '@/lib/trainerRelationshipDal'
import { countTrainerRelationshipNotifications } from '@/lib/trainerRelationshipNotifications'
import AccountProfileForm from './AccountProfileForm'

export default async function AccountPage() {
  const { supabase, user } = await getServerAuthContext()
  if (!user) redirect('/')

  const [profile, relationships, adminResult] = await Promise.all([
    getOwnAccountProfile(),
    listMyTrainerRelationships(),
    supabase.rpc('current_user_is_platform_admin'),
  ])
  if (!profile) redirect('/')

  const notifications = countTrainerRelationshipNotifications(relationships)
  const isPlatformAdmin = !adminResult.error && adminResult.data === true
  const timeZones = [
    ...new Set([
      'UTC',
      profile.time_zone,
      ...Intl.supportedValuesOf('timeZone'),
    ]),
  ].sort()

  return (
    <AppShell
      title="Account settings"
      eyebrow="Personal"
      currentPath="/account"
      userName={profile.display_name}
      avatarUrl={profile.avatar_url}
      navigation={buildAppNavigation({
        traineeNotifications: notifications.trainee,
        trainerNotifications: notifications.trainer,
        showTrainerTools: relationships.some((relationship) => relationship.my_role === 'trainer'),
        isPlatformAdmin,
      })}
      maxWidth="max-w-3xl"
    >
      <section aria-labelledby="profile-heading" className="rounded-[1.6rem] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Profile & preferences</p>
        <h2 id="profile-heading" className="mt-2 text-2xl font-black tracking-tight text-zinc-950 dark:text-white">Your personal details</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">These settings are private except where you deliberately appear in the trainer directory.</p>
        <AccountProfileForm profile={profile} email={user.email ?? ''} timeZones={timeZones} />
      </section>
    </AppShell>
  )
}
