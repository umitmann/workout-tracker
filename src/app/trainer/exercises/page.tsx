import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { buildAppNavigation } from '@/lib/appNavigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import { getOwnTrainerProfile } from '@/lib/trainerDal'
import { listOwnTrainerExercises } from '@/lib/trainerExerciseDal'
import { listMyTrainerRelationships } from '@/lib/trainerRelationshipDal'
import { countTrainerRelationshipNotifications } from '@/lib/trainerRelationshipNotifications'
import ArchiveExerciseButton from './ArchiveExerciseButton'
import TrainerExerciseForm from './TrainerExerciseForm'

export default async function TrainerExercisesPage() {
  const { supabase, user } = await getServerAuthContext()
  if (!user) redirect('/')

  const [profile, exercises, relationships, adminResult] = await Promise.all([
    getOwnTrainerProfile(),
    listOwnTrainerExercises(),
    listMyTrainerRelationships(),
    supabase.rpc('current_user_is_platform_admin'),
  ])
  if (!profile || profile.verification_status !== 'approved') redirect('/trainers/apply')

  const active = exercises.filter((exercise) => !exercise.archived_at)
  const archived = exercises.filter((exercise) => exercise.archived_at)
  const notifications = countTrainerRelationshipNotifications(relationships)
  const userName = user.user_metadata?.full_name ?? user.user_metadata?.display_name ?? user.email ?? 'Trainer'
  const avatarUrl = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null

  return (
    <AppShell
      title="My exercises"
      eyebrow="Trainer tools"
      currentPath="/trainer/exercises"
      userName={userName}
      avatarUrl={avatarUrl}
      navigation={buildAppNavigation({
        traineeNotifications: notifications.trainee,
        trainerNotifications: notifications.trainer,
        showTrainerTools: true,
        isPlatformAdmin: !adminResult.error && adminResult.data === true,
      })}
      maxWidth="max-w-4xl"
    >
      <section className="rounded-[1.6rem] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-7" aria-labelledby="create-exercise-heading">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Build your coaching library</p>
        <h2 id="create-exercise-heading" className="mt-2 text-2xl font-black tracking-tight text-zinc-950 dark:text-white">Create an exercise</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">Add your own coaching instructions and an optional YouTube demonstration. Choose whether every athlete or only your active clients can find it.</p>
        <div className="mt-6"><TrainerExerciseForm /></div>
      </section>

      <section className="mt-8" aria-labelledby="trainer-exercise-list-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Owned by you</p>
            <h2 id="trainer-exercise-list-heading" className="mt-1 text-2xl font-black text-zinc-950 dark:text-white">Your exercise library</h2>
          </div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{active.length} active</p>
        </div>

        {active.length === 0 ? (
          <p className="mt-4 rounded-[1.4rem] border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">Your trainer-created exercises will appear here.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {active.map((exercise) => (
              <details key={exercise.id} className="group rounded-[1.4rem] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-zinc-950 dark:text-white">{exercise.name}</span>
                    <span className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>{exercise.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{exercise.visibility === 'clients' ? 'Clients only' : 'Everyone'}</span>
                      {exercise.video_url && <><span aria-hidden="true">·</span><span>Video</span></>}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-orange-700 group-open:hidden dark:text-orange-300">Edit</span>
                  <span className="hidden shrink-0 text-xs font-bold text-zinc-500 group-open:inline">Close</span>
                </summary>
                <div className="border-t border-zinc-200 px-5 py-5 dark:border-zinc-800">
                  <TrainerExerciseForm exercise={exercise} />
                  <ArchiveExerciseButton exerciseId={exercise.id} />
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      {archived.length > 0 && (
        <details className="mt-8 rounded-2xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <summary className="min-h-11 cursor-pointer text-sm font-bold text-zinc-700 dark:text-zinc-300">Archived exercises ({archived.length})</summary>
          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
            {archived.map((exercise) => <li key={exercise.id} className="py-3 text-sm text-zinc-500 dark:text-zinc-400">{exercise.name}</li>)}
          </ul>
        </details>
      )}
    </AppShell>
  )
}
