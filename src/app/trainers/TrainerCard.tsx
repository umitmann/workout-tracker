import Link from 'next/link'
import type { TrainerDirectoryListing } from '@/lib/trainerTypes'

function specialtyLabel(specialty: string) {
  return specialty.replace(/[-_]+/g, ' ')
}

export default function TrainerCard({ trainer }: { trainer: TrainerDirectoryListing }) {
  return (
    <article className="flex h-full flex-col rounded-[1.4rem] border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-950/5 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-orange-900">
      <div className="flex items-start gap-3">
        {trainer.avatar_url ? (
          // Directory avatars are explicit public listing data.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={trainer.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange-100 text-base font-black text-orange-800 dark:bg-orange-950 dark:text-orange-200">
            {trainer.display_name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
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
      </div>

      <span className={`mt-4 self-start rounded-full px-3 py-1 text-xs font-semibold ${trainer.accepting_clients ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'}`}>
        {trainer.accepting_clients ? 'Accepting clients' : 'Not accepting clients'}
      </span>

      {trainer.bio && (
        <p className="mt-4 line-clamp-3 flex-1 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
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
        className="mt-5 inline-flex min-h-11 items-center text-sm font-bold text-orange-700 hover:text-orange-900 dark:text-orange-300"
      >
        View profile →
      </Link>
    </article>
  )
}
