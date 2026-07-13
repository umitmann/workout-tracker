'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { assignTrainerWorkoutAction } from '@/app/actions/trainerPlanning'
import Modal from '@/components/Modal'
import type { RoutineWithExercises } from '@/lib/dal'
import { dateNDaysAfter, localDateStr } from '@/lib/localDate'

const fieldClass = 'min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white'

type ScheduleWorkoutProps = {
  relationshipId: string
  traineeName: string
  templates: RoutineWithExercises[]
}

function ScheduleWorkoutModal({
  relationshipId,
  traineeName,
  templates,
  onClose,
}: ScheduleWorkoutProps & { onClose: () => void }) {
  const router = useRouter()
  const [state, action, pending] = useActionState(assignTrainerWorkoutAction, null)
  const today = localDateStr()

  useEffect(() => {
    if (state?.success) router.refresh()
  }, [router, state])

  return (
    <Modal
      title="Schedule workout"
      onClose={() => !pending && onClose()}
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      panelClassName="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] bg-white shadow-2xl dark:bg-zinc-900 sm:rounded-[1.75rem]"
    >
      <div className="border-b border-zinc-200 px-5 py-5 dark:border-zinc-800 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">New assignment</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-zinc-950 dark:text-white">Schedule workout</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">For {traineeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close schedule workout"
            className="grid min-h-11 min-w-11 place-items-center rounded-full text-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            ×
          </button>
        </div>
      </div>

      <form action={action} className="flex flex-col gap-5 px-5 py-6 sm:px-6">
        <input type="hidden" name="relationshipId" value={relationshipId} />

        <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Workout template
          <select name="routineId" required defaultValue="" className={fieldClass}>
            <option value="" disabled>Choose a template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Scheduled date
          <input
            type="date"
            name="scheduledDate"
            required
            min={today}
            max={dateNDaysAfter(today, 730)}
            defaultValue={dateNDaysAfter(today, 1)}
            className={fieldClass}
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Session title <span className="font-normal text-zinc-500">(optional)</span>
          <input name="title" maxLength={120} placeholder="Uses the template name when blank" className={fieldClass} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Notes for {traineeName}
          <textarea
            name="instructions"
            maxLength={2000}
            rows={4}
            placeholder="Intent, intensity, substitutions, or technique cues"
            className={fieldClass}
          />
        </label>

        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm leading-6 text-orange-900 dark:border-orange-900/70 dark:bg-orange-950/40 dark:text-orange-200">
          Assignment creates a fixed snapshot. Later template edits will not change this prescription.
        </div>

        {state && (
          <p
            role={state.success ? 'status' : 'alert'}
            aria-live="polite"
            className={`rounded-xl p-4 text-sm font-medium ${state.success ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'}`}
          >
            {state.success && <strong className="block">Workout assigned</strong>}
            <span className={state.success ? 'mt-1 block' : undefined}>{state.message}</span>
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="min-h-12 rounded-xl border border-zinc-300 px-5 py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {state?.success ? 'Done' : 'Cancel'}
          </button>
          {!state?.success && (
            <button
              type="submit"
              disabled={pending || templates.length === 0}
              className="min-h-12 rounded-xl bg-orange-600 px-6 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {pending ? 'Assigning…' : 'Assign'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}

export default function ScheduleWorkoutDialog(props: ScheduleWorkoutProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={props.templates.length === 0}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white shadow-sm shadow-orange-900/20 transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Schedule workout
      </button>

      {open && (
        <ScheduleWorkoutModal {...props} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
