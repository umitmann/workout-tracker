import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import { getDirectoryTrainer } from '@/lib/trainerDal'
import { isUuid } from '@/lib/trainerValidation'

function specialtyLabel(specialty: string) {
  return specialty.replace(/[-_]+/g, ' ')
}

export default async function TrainerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { user } = await getServerAuthContext()
  if (!user) redirect('/')

  const { id } = await params
  if (!isUuid(id)) notFound()
  const trainer = await getDirectoryTrainer(id)
  if (!trainer) notFound()

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
        <article className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
                {trainer.display_name}
              </h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {[trainer.location_text, trainer.remote_available ? 'Remote available' : null]
                  .filter(Boolean)
                  .join(' · ') || 'Location not specified'}
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {trainer.accepting_clients ? 'Accepting clients' : 'Not accepting clients'}
            </span>
          </div>

          {trainer.specialties.length > 0 && (
            <section className="mt-6" aria-labelledby="specialties-heading">
              <h3 id="specialties-heading" className="text-sm font-semibold text-zinc-900 dark:text-white">
                Specialties
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {trainer.specialties.map((specialty) => (
                  <li
                    key={specialty}
                    className="rounded-full bg-orange-50 px-3 py-1 text-sm text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                  >
                    {specialtyLabel(specialty)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-6" aria-labelledby="about-heading">
            <h3 id="about-heading" className="text-sm font-semibold text-zinc-900 dark:text-white">
              About
            </h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-700 dark:text-zinc-300">
              {trainer.bio || 'This trainer has not added a bio yet.'}
            </p>
          </section>
        </article>
      </main>
    </div>
  )
}
