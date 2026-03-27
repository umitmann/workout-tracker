import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { signOut } from '@/app/actions/auth'
import { startWorkout } from '@/app/actions/workouts'
import { getRecentWorkouts } from '@/lib/dal'

export default async function Dashboard() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const recentWorkouts = await getRecentWorkouts(5)
  const name = user.user_metadata?.full_name ?? user.email
  const avatar = user.user_metadata?.avatar_url as string | undefined
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Workout Tracker</h1>
        <div className="flex items-center gap-3">
          {avatar && (
            <img src={avatar} alt={name} className="h-8 w-8 rounded-full" />
          )}
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{name}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-8 flex flex-col gap-8">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{today}</p>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">Dashboard</h2>
        </div>

        <div className="flex gap-3">
          <form action={startWorkout}>
            <button
              type="submit"
              className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              Start workout
            </button>
          </form>
          <Link
            href="/routines"
            className="rounded-full border border-zinc-200 dark:border-zinc-700 px-6 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            Browse exercises
          </Link>
        </div>

        <div>
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3">
            Recent workouts
          </h3>
          {recentWorkouts.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-600">
              No workouts yet. Start your first one!
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentWorkouts.map((w: any) => (
                <li key={w.id}>
                  <Link
                    href={`/workout/${w.id}`}
                    className="flex items-center justify-between rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                  >
                    <span className="text-sm font-medium text-zinc-900 dark:text-white">
                      {new Date(w.date + 'T00:00:00').toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      {w.sets?.length ?? 0} sets
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
