'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { requestTrainerRelationshipAction } from '@/app/actions/trainerRelationships'
import type { TrainerRelationshipSummary } from '@/lib/trainerRelationshipTypes'

export default function RequestTrainingButton({
  trainerProfileId,
  acceptingClients,
  isOwnProfile,
  relationship,
}: {
  trainerProfileId: string
  acceptingClients: boolean
  isOwnProfile: boolean
  relationship: TrainerRelationshipSummary | null
}) {
  const [state, action, pending] = useActionState(requestTrainerRelationshipAction, null)
  const current = relationship?.status === 'pending' || relationship?.status === 'active'
    ? relationship
    : null

  if (isOwnProfile) {
    return (
      <p className="rounded-xl bg-zinc-100 p-4 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        This is your trainer profile.
      </p>
    )
  }

  if (current) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-orange-50 p-4 dark:bg-orange-950/40">
        <div>
          <p role="status" className="text-sm font-semibold text-orange-800 dark:text-orange-200">
            {current.status === 'active' ? 'Connection active' : 'Request pending'}
          </p>
          <p className="mt-1 text-xs text-orange-700 dark:text-orange-300">
            {current.status === 'active'
              ? 'Manage sharing permissions from your connections.'
              : 'The trainer must accept before the connection becomes active.'}
          </p>
        </div>
        <Link
          href="/connections"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-orange-700 hover:text-orange-900 dark:text-orange-300"
        >
          View connections →
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="trainerProfileId" value={trainerProfileId} />
      <button
        type="submit"
        disabled={pending || !acceptingClients}
        className="min-h-12 rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? 'Sending request…'
          : acceptingClients
            ? 'Request training'
            : 'Not accepting clients'}
      </button>
      {state && (
        <p
          role="status"
          className={`rounded-xl p-3 text-sm ${
            state.success
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  )
}
