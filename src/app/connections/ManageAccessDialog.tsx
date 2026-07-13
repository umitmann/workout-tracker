'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  grantTrainerAccessAction,
  revokeTrainerAccessAction,
} from '@/app/actions/trainerRelationships'
import Modal from '@/components/Modal'
import type {
  TrainerAccessHistoryScope,
  TrainerPermission,
} from '@/lib/trainerRelationshipTypes'

type AccessDraft = {
  workoutResults: boolean
  workoutScope: TrainerAccessHistoryScope
  bodyweight: boolean
  bodyweightScope: TrainerAccessHistoryScope
}

function permissionForm(
  relationshipId: string,
  permission: TrainerPermission,
  historyScope?: TrainerAccessHistoryScope,
) {
  const formData = new FormData()
  formData.set('relationshipId', relationshipId)
  formData.set('permission', permission)
  if (historyScope) formData.set('historyScope', historyScope)
  return formData
}

export default function ManageAccessDialog({
  relationshipId,
  trainerName,
  workoutResultsAccess,
  workoutResultsDateFrom,
  bodyweightAccess,
  bodyweightDateFrom,
}: {
  relationshipId: string
  trainerName: string
  workoutResultsAccess: boolean
  workoutResultsDateFrom: string | null
  bodyweightAccess: boolean
  bodyweightDateFrom: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(null)
  const baseline: AccessDraft = {
    workoutResults: workoutResultsAccess,
    workoutScope: workoutResultsDateFrom ? 'from_now' : 'all',
    bodyweight: bodyweightAccess,
    bodyweightScope: bodyweightDateFrom ? 'from_now' : 'all',
  }
  const [draft, setDraft] = useState<AccessDraft>(baseline)

  function openDialog() {
    setDraft(baseline)
    setMessage(null)
    setOpen(true)
  }

  function saveAccess() {
    setMessage(null)
    startTransition(async () => {
      const operations: Promise<{ success: boolean; message: string }>[] = []

      if (!draft.workoutResults && workoutResultsAccess) {
        operations.push(revokeTrainerAccessAction(
          null,
          permissionForm(relationshipId, 'workout_results.read'),
        ))
      } else if (
        draft.workoutResults
        && (!workoutResultsAccess || draft.workoutScope !== baseline.workoutScope)
      ) {
        operations.push(grantTrainerAccessAction(
          null,
          permissionForm(relationshipId, 'workout_results.read', draft.workoutScope),
        ))
      }

      if (!draft.bodyweight && bodyweightAccess) {
        operations.push(revokeTrainerAccessAction(
          null,
          permissionForm(relationshipId, 'bodyweight.read'),
        ))
      } else if (
        draft.bodyweight
        && (!bodyweightAccess || draft.bodyweightScope !== baseline.bodyweightScope)
      ) {
        operations.push(grantTrainerAccessAction(
          null,
          permissionForm(relationshipId, 'bodyweight.read', draft.bodyweightScope),
        ))
      }

      const results = await Promise.all(operations)
      const failure = results.find((result) => !result.success)
      if (failure) {
        setMessage({ success: false, text: failure.message })
        router.refresh()
        return
      }

      setMessage({ success: true, text: 'Access updated. Changes apply to the trainer’s next request.' })
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        Manage access
      </button>

      {open && (
        <Modal
          title="Trainer access"
          onClose={() => !pending && setOpen(false)}
          backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/65 backdrop-blur-sm sm:items-center sm:p-5"
          panelClassName="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] bg-white shadow-2xl dark:bg-zinc-900 sm:rounded-[1.75rem]"
        >
          <div className="border-b border-zinc-200 px-5 py-5 dark:border-zinc-800 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Your data, your choice</p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-zinc-950 dark:text-white">Trainer access</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  Choose exactly what {trainerName} may read. You can revoke either category at any time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                aria-label="Close trainer access"
                className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full text-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 px-5 py-6 sm:px-6">
            <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-700" aria-labelledby="workout-access-title">
              <label className="flex min-h-11 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={draft.workoutResults}
                  onChange={(event) => setDraft((current) => ({ ...current, workoutResults: event.target.checked }))}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-orange-600"
                />
                <span>
                  <span id="workout-access-title" className="block text-sm font-bold text-zinc-950 dark:text-white">Completed workout results</span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">Exercise, set, load, reps, time, distance, rest, and difficulty. In-progress workouts stay private.</span>
                </span>
              </label>
              {draft.workoutResults && (
                <label className="mt-3 flex flex-col gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  History included
                  <select
                    value={draft.workoutScope}
                    onChange={(event) => setDraft((current) => ({ ...current, workoutScope: event.target.value as TrainerAccessHistoryScope }))}
                    className="min-h-11 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  >
                    <option value="from_now">From today onward</option>
                    <option value="all">All available history</option>
                  </select>
                </label>
              )}
            </section>

            <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-700" aria-labelledby="bodyweight-access-title">
              <label className="flex min-h-11 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={draft.bodyweight}
                  onChange={(event) => setDraft((current) => ({ ...current, bodyweight: event.target.checked }))}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-orange-600"
                />
                <span>
                  <span id="bodyweight-access-title" className="block text-sm font-bold text-zinc-950 dark:text-white">Bodyweight history</span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">Date and weight only. This permission is independent from workout results.</span>
                </span>
              </label>
              {draft.bodyweight && (
                <label className="mt-3 flex flex-col gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  History included
                  <select
                    value={draft.bodyweightScope}
                    onChange={(event) => setDraft((current) => ({ ...current, bodyweightScope: event.target.value as TrainerAccessHistoryScope }))}
                    className="min-h-11 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  >
                    <option value="from_now">From today onward</option>
                    <option value="all">All available history</option>
                  </select>
                </label>
              )}
            </section>

            <p className="rounded-xl bg-blue-50 p-4 text-xs leading-5 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">
              Scheduling permission comes from the active connection. These switches only control result visibility.
            </p>

            {message && (
              <p
                role={message.success ? 'status' : 'alert'}
                aria-live="polite"
                className={`rounded-xl p-4 text-sm font-medium ${message.success ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'}`}
              >
                {message.text}
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="min-h-12 rounded-xl border border-zinc-300 px-5 py-3 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
              >
                Close
              </button>
              <button
                type="button"
                onClick={saveAccess}
                disabled={pending}
                className="min-h-12 rounded-xl bg-orange-600 px-6 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {pending ? 'Saving…' : 'Save access'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
