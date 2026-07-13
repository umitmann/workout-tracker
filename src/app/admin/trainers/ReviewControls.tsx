'use client'

import { useActionState } from 'react'
import { reviewTrainerProfileAction } from '@/app/actions/trainers'
import type { TrainerVerificationStatus } from '@/lib/trainerTypes'

export default function ReviewControls({
  profileId,
  currentStatus,
}: {
  profileId: string
  currentStatus: TrainerVerificationStatus
}) {
  const [state, action, pending] = useActionState(reviewTrainerProfileAction, null)

  return (
    <form action={action} className="mt-5 flex flex-col gap-3">
      <input type="hidden" name="profileId" value={profileId} />
      <div className="flex flex-wrap gap-2">
        {currentStatus !== 'approved' && (
          <button
            type="submit"
            name="verificationStatus"
            value="approved"
            disabled={pending}
            className="min-h-11 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Approve
          </button>
        )}
        {currentStatus !== 'rejected' && (
          <button
            type="submit"
            name="verificationStatus"
            value="rejected"
            disabled={pending}
            className="min-h-11 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
          >
            Reject
          </button>
        )}
        {currentStatus !== 'suspended' && (
          <button
            type="submit"
            name="verificationStatus"
            value="suspended"
            disabled={pending}
            className="min-h-11 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Suspend
          </button>
        )}
      </div>
      {state && (
        <p
          role="status"
          className={`text-sm ${state.success ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}
        >
          {state.message}
        </p>
      )}
    </form>
  )
}
