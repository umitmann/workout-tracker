import Link from 'next/link'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { buildAppNavigation } from '@/lib/appNavigation'
import { getUserTemplates } from '@/lib/dal'
import { getServerAuthContext } from '@/lib/serverAuth'
import { listMyTrainerRelationships } from '@/lib/trainerRelationshipDal'
import { countTrainerRelationshipNotifications } from '@/lib/trainerRelationshipNotifications'
import PasteTemplateButton from './PasteTemplateButton'
import TemplateSwipeList from './TemplateSwipeList'

export default async function WorkoutsPage() {
  const { user } = await getServerAuthContext()
  if (!user) redirect('/')
  const [templates, relationships] = await Promise.all([
    getUserTemplates(),
    listMyTrainerRelationships(),
  ])
  const notifications = countTrainerRelationshipNotifications(relationships)
  const userName = user.user_metadata?.full_name ?? user.user_metadata?.display_name ?? user.email ?? 'Account'
  const avatarUrl = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null

  return (
    <AppShell
      title="Workout plans"
      eyebrow="Reusable templates"
      currentPath="/workouts"
      userName={userName}
      avatarUrl={avatarUrl}
      navigation={buildAppNavigation({ traineeNotifications: notifications.trainee, trainerNotifications: notifications.trainer, showTrainerTools: relationships.some((relationship) => relationship.my_role === 'trainer') })}
      actions={<Link href="/workouts/new" className="inline-flex min-h-11 items-center rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700">New plan</Link>}
      maxWidth="max-w-4xl"
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Build once, reuse often</p>
        <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">Your workout templates</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">Create the prescriptions you use repeatedly. Trainer assignments are copied as fixed snapshots, so editing a template never rewrites an already scheduled workout.</p>
      </div>

      <div className="mt-6"><PasteTemplateButton /></div>

      {templates.length === 0 ? (
        <section className="mt-5 rounded-[1.5rem] border border-dashed border-zinc-300 bg-white/60 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/60">
          <p className="text-base font-bold text-zinc-900 dark:text-white">No workout templates yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500 dark:text-zinc-400">Start with one session you enjoy and refine it over time.</p>
          <Link href="/workouts/new" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-orange-600 px-5 text-sm font-bold text-white hover:bg-orange-700">Create your first plan</Link>
        </section>
      ) : (
        <TemplateSwipeList templates={templates} />
      )}
    </AppShell>
  )
}
