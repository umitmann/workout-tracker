'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import {
  acceptTrainerRelationshipAction,
  declineTrainerRelationshipAction,
  endTrainerRelationshipAction,
} from '@/app/actions/trainerRelationships'
import Modal from '@/components/Modal'
import type { TrainerRelationshipSummary } from '@/lib/trainerRelationshipTypes'
import ManageAccessDialog from './ManageAccessDialog'
import PermissionControl from './PermissionControl'

const statusClass: Record<TrainerRelationshipSummary['status'], string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  declined: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  ended: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  expired: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
}

function ActionStatus({ state }: {
  state: { success: boolean; message: string } | null
}) {
  if (!state) return null
  return (
    <p
      role="status"
      className={`mt-3 rounded-xl p-3 text-sm ${
        state.success
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
      }`}
    >
      {state.message}
    </p>
  )
}

function ReadOnlyPermission({ label, enabled, dateFrom }: {
  label: string
  enabled: boolean
  dateFrom: string | null
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-950">
      <span className="text-zinc-700 dark:text-zinc-300">{label}</span>
      <span className={enabled ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-500'}>
        {enabled ? (dateFrom ? `Shared from ${dateFrom}` : 'All history shared') : 'Not shared'}
      </span>
    </li>
  )
}

export default function ConnectionCard({ relationship }: {
  relationship: TrainerRelationshipSummary
}) {
  const [acceptState, acceptAction, accepting] = useActionState(acceptTrainerRelationshipAction, null)
  const [declineState, declineAction, declining] = useActionState(declineTrainerRelationshipAction, null)
  const [endState, endAction, ending] = useActionState(endTrainerRelationshipAction, null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const pending = accepting || declining || ending
  const isTrainee = relationship.my_role === 'trainee'
  const persistedTerminalState = relationship.status === 'ended'
    ? { success: true, message: 'Connection ended. Planning and sharing access are closed.' }
    : relationship.status === 'declined'
      ? { success: true, message: 'Training request declined.' }
      : relationship.status === 'expired'
        ? { success: true, message: 'Training request expired.' }
        : null
  const transitionState = endState ?? declineState ?? acceptState ?? persistedTerminalState
  const effectiveStatus = endState?.success
    ? 'ended'
    : declineState?.success
      ? 'declined'
      : acceptState?.success
        ? 'active'
        : relationship.status
  const statusLabel = acceptState?.success && relationship.status === 'active'
    ? 'Connected'
    : effectiveStatus === 'ended'
      ? 'Closed'
      : effectiveStatus

  return (
    <article className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            {relationship.counterparty_display_name}
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {isTrainee ? 'Your trainer' : 'Trainee'} · requested {relationship.created_at.slice(0, 10)}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusClass[effectiveStatus]}`}>
          {statusLabel}
        </span>
      </div>

      {effectiveStatus === 'pending' && (
        <div className="mt-5">
          {relationship.awaiting_my_response ? (
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {isTrainee
                  ? 'This trainer invited you to connect.'
                  : 'This trainee wants to connect with you.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <form action={acceptAction}>
                  <input type="hidden" name="relationshipId" value={relationship.relationship_id} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="min-h-11 rounded-xl bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    {accepting ? 'Accepting…' : 'Accept'}
                  </button>
                </form>
                <form action={declineAction}>
                  <input type="hidden" name="relationshipId" value={relationship.relationship_id} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="min-h-11 rounded-xl border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {declining ? 'Declining…' : 'Decline'}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Waiting for {isTrainee ? 'the trainer' : 'the trainee'} to accept. No access is active yet.
              </p>
              <button
                type="button"
                onClick={() => setConfirmEnd(true)}
                className="mt-3 min-h-11 text-sm font-semibold text-red-600 hover:text-red-700 dark:text-red-400"
              >
                Cancel request
              </button>
            </div>
          )}
        </div>
      )}

      {effectiveStatus === 'active' && (
        <div className="mt-5 flex flex-col gap-4">
          <div className="rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-800 dark:bg-blue-950 dark:text-blue-200">
            {/* Historical contract wording: "An active connection does not share workout results or bodyweight by itself." */}
            A connection alone does not share workout results or bodyweight.
            {isTrainee
              ? ' You control each category independently below.'
              : ' The trainee controls each category independently.'}
          </div>

          {isTrainee ? (
            <div className="flex flex-col gap-3" aria-label="Sharing permissions">
              {/* Historical Phase 3 contract wording: "result-reading remains disabled".
                  Phase 5 readers now live exclusively in the trainer client workspace. */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950">
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">Trainer access</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    Review both categories together, with sharing off unless you choose it.
                  </p>
                </div>
                <ManageAccessDialog
                  relationshipId={relationship.relationship_id}
                  trainerName={relationship.counterparty_display_name}
                  workoutResultsAccess={relationship.workout_results_access}
                  workoutResultsDateFrom={relationship.workout_results_date_from}
                  bodyweightAccess={relationship.bodyweight_access}
                  bodyweightDateFrom={relationship.bodyweight_date_from}
                />
              </div>
              <PermissionControl
                relationshipId={relationship.relationship_id}
                permission="workout_results.read"
                label="Completed workout results"
                description="When granted, your trainer can read completed results in the selected date scope. In-progress workouts are never included."
                enabled={relationship.workout_results_access}
                dateFrom={relationship.workout_results_date_from}
              />
              <PermissionControl
                relationshipId={relationship.relationship_id}
                permission="bodyweight.read"
                label="Bodyweight history"
                description="This is separate from workout results and can be revoked independently."
                enabled={relationship.bodyweight_access}
                dateFrom={relationship.bodyweight_date_from}
              />
            </div>
          ) : (
            <section aria-labelledby={`access-${relationship.relationship_id}`}>
              <h3 id={`access-${relationship.relationship_id}`} className="text-sm font-semibold text-zinc-900 dark:text-white">
                Trainee sharing choices
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                <ReadOnlyPermission
                  label="Completed workout results"
                  enabled={relationship.workout_results_access}
                  dateFrom={relationship.workout_results_date_from}
                />
                <ReadOnlyPermission
                  label="Bodyweight history"
                  enabled={relationship.bodyweight_access}
                  dateFrom={relationship.bodyweight_date_from}
                />
              </ul>
              <p className="mt-2 text-xs text-zinc-500">
                Shared categories are available only through audited, read-only result views.
              </p>
            </section>
          )}

          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            className="min-h-11 self-start text-sm font-semibold text-red-600 hover:text-red-700 dark:text-red-400"
          >
            End relationship
          </button>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <Link
          href={`/connections/${relationship.relationship_id}`}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400"
        >
          View consent history →
        </Link>
      </div>

      <ActionStatus state={transitionState} />

      {confirmEnd && !endState?.success && (
        <Modal
          title={relationship.status === 'pending' ? 'Cancel training request' : 'End relationship'}
          onClose={() => !ending && setConfirmEnd(false)}
          destructive
          backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          panelClassName="w-full max-w-sm rounded-t-[1.75rem] bg-white p-6 shadow-xl dark:bg-zinc-900 sm:rounded-[1.75rem]"
        >
          <h3 className="text-lg font-black text-zinc-950 dark:text-white">
            {relationship.status === 'pending' ? 'Cancel training request?' : 'End relationship?'}
          </h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {relationship.status === 'pending'
              ? 'The pending request will be closed.'
              : 'The connection ends immediately and all active sharing permissions are revoked.'}
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row-reverse">
            <form action={endAction} className="flex-1">
              <input type="hidden" name="relationshipId" value={relationship.relationship_id} />
              <button
                type="submit"
                disabled={ending}
                className="min-h-12 w-full rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {ending ? 'Ending…' : relationship.status === 'pending' ? 'Cancel request' : 'End relationship'}
              </button>
            </form>
            <button type="button" onClick={() => setConfirmEnd(false)} disabled={ending} className="min-h-12 flex-1 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
              Keep connection
            </button>
          </div>
        </Modal>
      )}
    </article>
  )
}
