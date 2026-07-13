import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import { getOwnTrainerProfile } from '@/lib/trainerDal'
import TrainerProfileForm from './TrainerProfileForm'

export default async function TrainerApplicationPage() {
  const { user } = await getServerAuthContext()
  if (!user) redirect('/')

  const profile = await getOwnTrainerProfile()
  const metadataName =
    typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.display_name === 'string'
        ? user.user_metadata.display_name
        : ''

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <Link
            href="/trainers"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-white"
          >
            ← Trainers
          </Link>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Trainer profile</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
            {profile ? 'Manage your trainer profile' : 'Become a trainer'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            This information can become public only after administrator approval and only while your directory state is published.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <TrainerProfileForm profile={profile} defaultDisplayName={metadataName} />
        </div>
      </main>
    </div>
  )
}
