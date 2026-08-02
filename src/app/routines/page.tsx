import { redirect } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { buildAppNavigation } from '@/lib/appNavigation'
import { getAllExercises } from '@/lib/dal'
import { getServerAuthContext } from '@/lib/serverAuth'
import { listMyTrainerRelationships } from '@/lib/trainerRelationshipDal'
import { countTrainerRelationshipNotifications } from '@/lib/trainerRelationshipNotifications'
import { getOwnTrainerProfile } from '@/lib/trainerDal'
import ExerciseLibrary from './ExerciseLibrary'

export default async function RoutinesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>
}) {
  const { user } = await getServerAuthContext()
  if (!user) redirect('/')
  const { q, category } = await searchParams
  const [exercises, relationships, trainerProfile] = await Promise.all([
    getAllExercises(),
    listMyTrainerRelationships(),
    getOwnTrainerProfile(),
  ])
  const notifications = countTrainerRelationshipNotifications(relationships)
  const userName = user.user_metadata?.full_name ?? user.user_metadata?.display_name ?? user.email ?? 'Account'
  const avatarUrl = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null

  return (
    <AppShell
      title="Exercises"
      eyebrow="Movement library"
      currentPath="/routines"
      userName={userName}
      avatarUrl={avatarUrl}
      navigation={buildAppNavigation({ traineeNotifications: notifications.trainee, trainerNotifications: notifications.trainer, showTrainerTools: relationships.some((relationship) => relationship.my_role === 'trainer') })}
      maxWidth="max-w-4xl"
      actions={trainerProfile?.verification_status === 'approved' ? (
        <Link href="/trainer/exercises" className="flex min-h-11 items-center rounded-xl bg-orange-600 px-3 text-sm font-black text-white transition hover:bg-orange-700 sm:px-4">
          <span className="sm:hidden" aria-hidden="true">+</span>
          <span className="hidden sm:inline">Create exercise</span>
          <span className="sr-only sm:hidden">Create exercise</span>
        </Link>
      ) : undefined}
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Explore & learn</p>
        <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">Exercise library</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">Search movements, review technique, and understand which equipment and muscle groups each exercise uses.</p>
      </div>

      <ExerciseLibrary exercises={exercises} initialQuery={q} initialCategory={category} />
    </AppShell>
  )
}
