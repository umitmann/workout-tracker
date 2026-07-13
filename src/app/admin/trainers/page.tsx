import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { buildAppNavigation } from '@/lib/appNavigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import { currentUserIsPlatformAdmin, listTrainerProfilesForAdmin } from '@/lib/trainerDal'
import { listMyTrainerRelationships } from '@/lib/trainerRelationshipDal'
import { countTrainerRelationshipNotifications } from '@/lib/trainerRelationshipNotifications'
import { parseAdminStatus } from '@/lib/trainerValidation'
import { TRAINER_VERIFICATION_STATUSES } from '@/lib/trainerTypes'
import type { TrainerVerificationStatus } from '@/lib/trainerTypes'
import ReviewControls from './ReviewControls'

function label(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function statusHref(status: TrainerVerificationStatus | null) {
  return status ? `/admin/trainers?status=${status}` : '/admin/trainers?status=all'
}

export default async function TrainerAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>
}) {
  const { user } = await getServerAuthContext()
  if (!user) redirect('/')
  if (!(await currentUserIsPlatformAdmin())) notFound()

  const params = await searchParams
  const status = parseAdminStatus(params.status)
  const [profiles, relationships] = await Promise.all([
    listTrainerProfilesForAdmin(status),
    listMyTrainerRelationships(),
  ])
  const notifications = countTrainerRelationshipNotifications(relationships)
  const userName = user.user_metadata?.full_name ?? user.user_metadata?.display_name ?? user.email ?? 'Administrator'
  const avatarUrl = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null

  return (
    <AppShell
      title="Trainer review"
      eyebrow="Platform administration"
      currentPath="/admin/trainers"
      userName={userName}
      avatarUrl={avatarUrl}
      navigation={buildAppNavigation({ traineeNotifications: notifications.trainee, trainerNotifications: notifications.trainer, showTrainerTools: relationships.some((relationship) => relationship.my_role === 'trainer'), isPlatformAdmin: true })}
      actions={<Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-zinc-500 hover:text-zinc-950 dark:hover:text-white">← Dashboard</Link>}
      maxWidth="max-w-5xl"
    >
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Public listing review</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">Trainer applications</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">Review public listing content only. Platform administration does not grant access to workouts, body measurements, or trainee data.</p>
          </div>

          <nav aria-label="Verification status" className="mt-6 flex gap-2 overflow-x-auto pb-1">
            {[null, ...TRAINER_VERIFICATION_STATUSES].map((value) => {
              const active = value === status
              return <Link key={value ?? 'all'} href={statusHref(value)} aria-current={active ? 'page' : undefined} className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-bold ${active ? 'bg-orange-600 text-white' : 'border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}`}>{value ? label(value) : 'All'}</Link>
            })}
          </nav>

          <p className="mt-5 text-sm font-medium text-zinc-500 dark:text-zinc-400">{profiles.length} profile{profiles.length === 1 ? '' : 's'}</p>

          <div className="mt-4 flex flex-col gap-4">
            {profiles.map((profile) => (
              <article key={profile.id} className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-100 font-black text-orange-800 dark:bg-orange-950 dark:text-orange-200">{profile.display_name.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-black text-zinc-950 dark:text-white">{profile.display_name}</h3>
                      <p className="mt-1 text-xs text-zinc-500">Submitted {new Date(profile.created_at).toLocaleDateString()} · Listing {profile.listing_status}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{label(profile.verification_status)}</span>
                </div>
                <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">{profile.bio || 'No bio provided.'}</p>
                <dl className="mt-5 grid gap-4 rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-950 sm:grid-cols-2">
                  <div><dt className="text-xs font-bold uppercase tracking-wide text-zinc-500">Specialties</dt><dd className="mt-1 text-zinc-800 dark:text-zinc-200">{profile.specialties.join(', ') || 'None'}</dd></div>
                  <div><dt className="text-xs font-bold uppercase tracking-wide text-zinc-500">Availability</dt><dd className="mt-1 text-zinc-800 dark:text-zinc-200">{[profile.location_text, profile.remote_available ? 'Remote' : null, profile.accepting_clients ? 'Accepting clients' : 'Not accepting clients'].filter(Boolean).join(' · ')}</dd></div>
                </dl>
                <ReviewControls profileId={profile.id} currentStatus={profile.verification_status} />
              </article>
            ))}
          </div>

          {profiles.length === 0 && <p className="mt-5 rounded-[1.5rem] border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">No trainer profiles have this status.</p>}
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-[1.4rem] border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Review standard</p>
            <ul className="mt-4 flex flex-col gap-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300"><li>Clear professional identity</li><li>Appropriate public content</li><li>Specific, credible specialties</li><li>No private contact details</li></ul>
          </section>
          <section className="rounded-[1.4rem] border border-orange-200 bg-orange-50 p-5 dark:border-orange-900/70 dark:bg-orange-950/30">
            <h3 className="text-sm font-black text-orange-950 dark:text-orange-100">Authority stays separate</h3>
            <p className="mt-2 text-sm leading-6 text-orange-900/80 dark:text-orange-200/80">Approval controls directory visibility only. It never unlocks trainee health data.</p>
          </section>
        </aside>
      </div>
    </AppShell>
  )
}
