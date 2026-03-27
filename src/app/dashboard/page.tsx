import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { signOut } from '@/app/actions/auth'
import { startWorkout } from '@/app/actions/workouts'
import { getMonthWorkouts } from '@/lib/dal'
import CalendarView from '@/app/workouts/CalendarView'

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { y, m } = await searchParams
  const now = new Date()
  const year = y ? Number(y) : now.getFullYear()
  const month = m ? Number(m) : now.getMonth() + 1

  const [workouts] = await Promise.all([
    getMonthWorkouts(year, month),
  ])

  const name = user.user_metadata?.full_name ?? user.email
  const avatar = user.user_metadata?.avatar_url as string | undefined

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

      <main className="max-w-lg mx-auto px-6 py-8 flex flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <form action={startWorkout}>
            <button
              type="submit"
              className="rounded-full bg-orange-500 hover:bg-orange-600 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors shadow-md shadow-orange-200 dark:shadow-none"
            >
              Start workout
            </button>
          </form>
          <Link
            href="/workouts"
            className="rounded-full border border-zinc-200 dark:border-zinc-700 px-6 py-3 text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            Templates
          </Link>
          <Link
            href="/routines"
            className="rounded-full border border-zinc-200 dark:border-zinc-700 px-6 py-3 text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            Exercises
          </Link>
        </div>

        <CalendarView year={year} month={month} workouts={workouts} basePath="/dashboard" />
      </main>
    </div>
  )
}
