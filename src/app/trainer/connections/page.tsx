import Link from 'next/link'
import { redirect } from 'next/navigation'
import ConnectionCard from '@/app/connections/ConnectionCard'
import { getServerAuthContext } from '@/lib/serverAuth'
import { getOwnTrainerProfile } from '@/lib/trainerDal'
import { listMyTrainerRelationships } from '@/lib/trainerRelationshipDal'

export default async function TrainerConnectionsPage() {
  const { user } = await getServerAuthContext()
  if (!user) redirect('/')

  const [profile, allRelationships] = await Promise.all([
    getOwnTrainerProfile(),
    listMyTrainerRelationships(),
  ])
  const relationships = allRelationships.filter(
    (relationship) => relationship.my_role === 'trainer',
  )

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
              ← Dashboard
            </Link>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Trainer connections</h1>
          </div>
          <Link href="/trainers/apply" className="text-sm font-semibold text-orange-600 dark:text-orange-400">
            Trainer profile
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Requests and trainees</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Accepting a request establishes the connection only. It does not grant access to workout or bodyweight data.
          </p>
        </div>

        {!profile || profile.verification_status !== 'approved' ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            An approved trainer profile is required to accept new trainee requests.
            <Link href="/trainers/apply" className="ml-1 font-semibold underline">View trainer profile</Link>
          </div>
        ) : relationships.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No trainee requests or connections yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {relationships.map((relationship) => (
              <ConnectionCard key={relationship.relationship_id} relationship={relationship} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
