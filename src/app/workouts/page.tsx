import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getUserTemplates } from '@/lib/dal'
import { deleteTemplate } from '@/app/actions/templates'

export default async function WorkoutsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const templates = await getUserTemplates()

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          ← Dashboard
        </Link>
        <h1 className="text-sm font-medium text-zinc-900 dark:text-white">My Workouts</h1>
        <Link
          href="/workouts/new"
          className="rounded-full bg-orange-500 hover:bg-orange-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors"
        >
          New
        </Link>
      </header>

      <main className="max-w-lg mx-auto px-6 py-6 flex flex-col gap-3">
        {templates.length === 0 && (
          <p className="text-sm text-zinc-400 dark:text-zinc-600 py-4">
            No workout templates yet. Create one to get started.
          </p>
        )}

        {templates.map((t) => (
          <div key={t.id} className="flex items-center gap-2">
            <Link
              href={`/workouts/${t.id}`}
              className="flex-1 flex items-center justify-between rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
            >
              <span className="text-sm font-medium text-zinc-900 dark:text-white">{t.name}</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-600">
                {t.routine_exercises.length} exercise{t.routine_exercises.length !== 1 ? 's' : ''}
              </span>
            </Link>
            <form action={deleteTemplate.bind(null, t.id)}>
              <button
                type="submit"
                title="Delete template"
                className="flex items-center justify-center w-8 h-8 rounded-full text-zinc-300 dark:text-zinc-700 hover:text-red-500 dark:hover:text-red-500 transition-colors"
              >
                ✕
              </button>
            </form>
          </div>
        ))}
      </main>
    </div>
  )
}
