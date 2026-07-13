import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import {
  currentUserIsPlatformAdmin,
  listTrainerProfilesForAdmin,
} from '@/lib/trainerDal'
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
  const profiles = await listTrainerProfilesForAdmin(status)

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <Link
            href="/dashboard"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-white"
          >
            ← Dashboard
          </Link>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Trainer review</h1>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Trainer applications</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Review public listing content only. Platform administration does not grant access to workouts, body measurements, or trainee data.
          </p>
        </div>

        <nav aria-label="Verification status" className="flex flex-wrap gap-2">
          {[null, ...TRAINER_VERIFICATION_STATUSES].map((value) => {
            const active = value === status
            return (
              <Link
                key={value ?? 'all'}
                href={statusHref(value)}
                aria-current={active ? 'page' : undefined}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  active
                    ? 'bg-orange-500 text-white'
                    : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900'
                }`}
              >
                {value ? label(value) : 'All'}
              </Link>
            )
          })}
        </nav>

        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {profiles.length} profile{profiles.length === 1 ? '' : 's'}
        </p>

        <div className="flex flex-col gap-4">
          {profiles.map((profile) => (
            <article
              key={profile.id}
              className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                    {profile.display_name}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Submitted {new Date(profile.created_at).toLocaleDateString()} · Listing {profile.listing_status}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {label(profile.verification_status)}
                </span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                {profile.bio || 'No bio provided.'}
              </p>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-zinc-500">Specialties</dt>
                  <dd className="text-zinc-800 dark:text-zinc-200">
                    {profile.specialties.join(', ') || 'None'}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-500">Availability</dt>
                  <dd className="text-zinc-800 dark:text-zinc-200">
                    {[
                      profile.location_text,
                      profile.remote_available ? 'Remote' : null,
                      profile.accepting_clients ? 'Accepting clients' : 'Not accepting clients',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </dd>
                </div>
              </dl>
              <ReviewControls profileId={profile.id} currentStatus={profile.verification_status} />
            </article>
          ))}
        </div>

        {profiles.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No trainer profiles have this status.
          </p>
        )}
      </main>
    </div>
  )
}
