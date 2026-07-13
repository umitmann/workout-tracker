'use client'

import { useActionState, useState } from 'react'
import {
  grantTrainerAccessAction,
  revokeTrainerAccessAction,
} from '@/app/actions/trainerRelationships'
import type { TrainerPermission } from '@/lib/trainerRelationshipTypes'

export default function PermissionControl({
  relationshipId,
  permission,
  label,
  description,
  enabled,
  dateFrom,
}: {
  relationshipId: string
  permission: TrainerPermission
  label: string
  description: string
  enabled: boolean
  dateFrom: string | null
}) {
  const [grantState, grantAction, grantPending] = useActionState(grantTrainerAccessAction, null)
  const [revokeState, revokeAction, revokePending] = useActionState(revokeTrainerAccessAction, null)
  const [lastAction, setLastAction] = useState<'grant' | 'revoke'>('grant')
  const pending = grantPending || revokePending
  const state = lastAction === 'revoke' ? revokeState : grantState
  const headingId = `permission-${relationshipId}-${permission.replaceAll('.', '-')}`

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-md">
          <h4 id={headingId} className="text-sm font-semibold text-zinc-900 dark:text-white">{label}</h4>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{description}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            enabled
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
          }`}
        >
          {enabled ? 'Granted' : 'Not shared'}
        </span>
      </div>

      <form
        action={grantAction}
        onSubmit={() => setLastAction('grant')}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <input type="hidden" name="relationshipId" value={relationshipId} />
        <input type="hidden" name="permission" value={permission} />
        <label className="flex flex-1 flex-col gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          History included
          <select
            name="historyScope"
            defaultValue={dateFrom ? 'from_now' : 'all'}
            className="min-h-11 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
          >
            <option value="from_now">From today onward</option>
            <option value="all">All available history</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {grantPending ? 'Saving…' : enabled ? 'Update scope' : 'Grant access'}
        </button>
      </form>

      {enabled && (
        <form action={revokeAction} onSubmit={() => setLastAction('revoke')} className="mt-3">
          <input type="hidden" name="relationshipId" value={relationshipId} />
          <input type="hidden" name="permission" value={permission} />
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 dark:text-red-400"
          >
            {revokePending ? 'Revoking…' : 'Revoke access'}
          </button>
        </form>
      )}

      {state && (
        <p
          role="status"
          className={`mt-3 rounded-lg p-3 text-xs ${
            state.success
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
          }`}
        >
          {state.message}
        </p>
      )}
    </section>
  )
}
