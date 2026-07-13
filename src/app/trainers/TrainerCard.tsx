import Link from 'next/link'
import type { TrainerDirectoryListing } from '@/lib/trainerTypes'

function specialtyLabel(specialty: string) {
  return specialty.replace(/[-_]+/g, ' ')
}

export default function TrainerCard({ trainer }: { trainer: TrainerDirectoryListing }) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            <Link href={`/trainers/${trainer.id}`} className="hover:text-orange-500">
              {trainer.display_name}
            </Link>
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {[trainer.location_text, trainer.remote_available ? 'Remote' : null]
              .filter(Boolean)
              .join(' · ') || 'Location not specified'}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            trainer.accepting_clients
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
          }`}
        >
          {trainer.accepting_clients ? 'Accepting clients' : 'Not accepting clients'}
        </span>
      </div>

      {trainer.bio && (
        <p className="mt-4 line-clamp-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          {trainer.bio}
        </p>
      )}

      {trainer.specialties.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Specialties">
          {trainer.specialties.map((specialty) => (
            <li
              key={specialty}
              className="rounded-full bg-orange-50 px-3 py-1 text-xs text-orange-700 dark:bg-orange-950 dark:text-orange-300"
            >
              {specialtyLabel(specialty)}
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/trainers/${trainer.id}`}
        className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400"
      >
        View profile →
      </Link>
    </article>
  )
}
