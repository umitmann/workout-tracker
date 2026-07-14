import { redirect } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { buildAppNavigation } from '@/lib/appNavigation'
import { getAllExercises } from '@/lib/dal'
import { getServerAuthContext } from '@/lib/serverAuth'
import { listMyTrainerRelationships } from '@/lib/trainerRelationshipDal'
import { countTrainerRelationshipNotifications } from '@/lib/trainerRelationshipNotifications'
import { getOwnTrainerProfile } from '@/lib/trainerDal'
import ExerciseSearch from './ExerciseSearch'

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
  const filtered = exercises.filter((exercise) => {
    const matchesQuery = !q || exercise.name.toLowerCase().includes(q.toLowerCase())
    const matchesCategory = !category || exercise.category === category
    return matchesQuery && matchesCategory
  })
  const categories = [...new Set(exercises.map((exercise) => exercise.category).filter(Boolean))] as string[]
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

      <div className="mt-6 rounded-[1.4rem] border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><ExerciseSearch categories={categories} /></div>
      <p className="mt-5 text-sm font-medium text-zinc-500 dark:text-zinc-400">{filtered.length} exercise{filtered.length === 1 ? '' : 's'}</p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {filtered.map((exercise) => (
          <li key={exercise.id}>
            <Link href={`/routines/${exercise.id}`} className="flex min-h-20 h-full items-center justify-between gap-4 rounded-[1.3rem] border border-zinc-200 bg-white px-5 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-orange-900">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-black text-zinc-950 dark:text-white">{exercise.name}</p>
                  {exercise.creator_id && <span className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[0.65rem] font-bold text-orange-800 dark:bg-orange-950 dark:text-orange-200">PT</span>}
                </div>
                {exercise.category && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{exercise.category}</p>}
              </div>
              {exercise.equipment && <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{exercise.equipment}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  )
}
