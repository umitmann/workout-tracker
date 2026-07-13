'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  cancelWorkoutPlanAction,
  startWorkoutPlanAction,
} from '@/app/actions/trainerPlanning'
import Modal from '@/components/Modal'
import type {
  AttributedWorkoutPlan,
  TrainerPlanningActionState,
} from '@/lib/trainerPlanningTypes'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${value}T00:00:00`))
}

function targetSummary(plan: AttributedWorkoutPlan['exercises'][number]) {
  const sets = `${plan.sets} set${plan.sets === 1 ? '' : 's'}`
  if (plan.set_details?.length) {
    return `${sets} · varied targets`
  }
  const target = [
    plan.reps != null ? `${plan.reps} reps` : null,
    plan.weight != null ? `${plan.weight} kg` : null,
    plan.duration_minutes != null ? `${plan.duration_minutes} min` : null,
    plan.distance != null ? `${plan.distance} km` : null,
  ].filter(Boolean).join(' · ')
  return target ? `${sets} · ${target}` : sets
}

function WorkoutPlanModal({
  plan,
  onClose,
}: {
  plan: AttributedWorkoutPlan
  onClose: () => void
}) {
  const router = useRouter()
  const [state, startAction, starting] = useActionState(startWorkoutPlanAction, null)
  const [cancelState, cancelAction, cancelling] = useActionState(async (
    _previousState: TrainerPlanningActionState | null,
    formData: FormData,
  ) => {
    const result = await cancelWorkoutPlanAction(null, formData)
    if (result.success) {
      onClose()
      router.refresh()
    }
    return result
  }, null)

  useEffect(() => {
    if (state?.success && state.workoutId) {
      router.push(`/workout/${state.workoutId}`)
    }
  }, [router, state])

  return (
    <Modal
      title={`${plan.title} workout plan`}
      onClose={() => !starting && !cancelling && onClose()}
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/65 backdrop-blur-sm sm:items-center sm:p-5"
      panelClassName="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] bg-white shadow-2xl dark:bg-zinc-900 sm:rounded-[1.75rem]"
    >
      <div className="border-b border-zinc-200 px-5 py-5 dark:border-zinc-800 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">{plan.scheduled_date}</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-zinc-950 dark:text-white">{plan.title}</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {plan.assigned_by_name ? `Assigned by ${plan.assigned_by_name}` : 'Scheduled by you'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={starting || cancelling}
            aria-label="Close workout plan"
            className="grid min-h-11 min-w-11 place-items-center rounded-full text-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-5 px-5 py-6 sm:px-6">
        {plan.instructions && (
          <section aria-labelledby="coach-notes-title" className="rounded-2xl bg-orange-50 p-4 dark:bg-orange-950/40">
            <h3 id="coach-notes-title" className="text-sm font-bold text-orange-950 dark:text-orange-100">Coach notes</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-orange-900 dark:text-orange-200">{plan.instructions}</p>
          </section>
        )}

        <section aria-labelledby="prescription-title">
          <div className="flex items-center justify-between gap-3">
            <h3 id="prescription-title" className="text-sm font-bold text-zinc-950 dark:text-white">Prescription</h3>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold capitalize text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{plan.status}</span>
          </div>
          <ol className="mt-3 divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {plan.exercises.map((exercise, index) => (
              <li key={`${exercise.exercise_id}-${exercise.order}`} className="flex gap-3 px-4 py-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-zinc-100 text-xs font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">{index + 1}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-zinc-900 dark:text-white">{exercise.exercise_name}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{targetSummary(exercise)}</span>
                  {(exercise.tempo || exercise.rest_seconds != null) && (
                    <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                      {[exercise.tempo ? `Tempo ${exercise.tempo}` : null, exercise.rest_seconds != null ? `${exercise.rest_seconds}s rest` : null].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <p className="rounded-xl bg-blue-50 p-4 text-xs leading-5 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">
          The prescription is fixed at assignment. Template edits cannot change what you received.
        </p>

        {(state && !state.success) && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{state.message}</p>}
        {(cancelState && !cancelState.success) && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{cancelState.message}</p>}

        {plan.status === 'scheduled' ? (
          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <form action={startAction} className="flex-1">
              <input type="hidden" name="planId" value={plan.plan_id} />
              <button type="submit" disabled={starting || cancelling} className="min-h-12 w-full rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">
                {starting ? 'Starting…' : 'Start workout'}
              </button>
            </form>
            <form action={cancelAction} className="flex-1">
              <input type="hidden" name="planId" value={plan.plan_id} />
              <button type="submit" disabled={starting || cancelling} className="min-h-12 w-full rounded-xl border border-red-300 px-5 py-3 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950">
                {cancelling ? 'Cancelling…' : 'Cancel plan'}
              </button>
            </form>
          </div>
        ) : plan.workout_id ? (
          <Link href={`/workout/${plan.workout_id}`} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white hover:bg-orange-700">
            {plan.status === 'completed' ? 'View workout' : 'Continue workout'}
          </Link>
        ) : null}
      </div>
    </Modal>
  )
}

export default function WorkoutPlanAgenda({
  plans,
  loadFailed = false,
}: {
  plans: AttributedWorkoutPlan[]
  loadFailed?: boolean
}) {
  const [selected, setSelected] = useState<AttributedWorkoutPlan | null>(null)

  return (
    <section aria-labelledby="upcoming-plan-heading" className="rounded-[1.5rem] border border-zinc-200/80 bg-white p-5 shadow-sm shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Your schedule</p>
          <h2 id="upcoming-plan-heading" className="mt-1 text-xl font-black tracking-tight text-zinc-950 dark:text-white">Upcoming plans</h2>
        </div>
        <Link href="/connections" className="inline-flex min-h-11 items-center text-sm font-bold text-orange-700 hover:text-orange-900 dark:text-orange-300">
          My PT
        </Link>
      </div>

      {loadFailed ? (
        <div role="alert" className="mt-5 rounded-2xl bg-red-50 p-5 dark:bg-red-950/50">
          <p className="text-sm font-bold text-red-900 dark:text-red-100">Plans temporarily unavailable</p>
          <p className="mt-1 text-sm leading-6 text-red-700 dark:text-red-200">Your training history is still available. Refresh before starting an assigned workout.</p>
        </div>
      ) : plans.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 p-5 dark:border-zinc-700">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No coached workouts scheduled</p>
          <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Trainer assignments will appear here as fixed prescriptions you can review before starting.</p>
        </div>
      ) : (
        <ol className="mt-5 flex flex-col gap-2">
          {plans.map((plan) => (
            <li key={plan.plan_id}>
              <button
                type="button"
                onClick={() => setSelected(plan)}
                aria-label={`Open workout plan on ${plan.scheduled_date}: ${plan.title}`}
                className="group flex min-h-16 w-full items-center gap-3 rounded-2xl border border-zinc-200 px-3 py-3 text-left transition hover:border-orange-300 hover:bg-orange-50/60 dark:border-zinc-800 dark:hover:border-orange-900 dark:hover:bg-orange-950/20"
              >
                <time dateTime={plan.scheduled_date} className="grid h-11 w-12 shrink-0 place-items-center rounded-xl bg-zinc-100 text-center text-[0.68rem] font-bold uppercase leading-tight text-zinc-600 group-hover:bg-white dark:bg-zinc-800 dark:text-zinc-300 dark:group-hover:bg-zinc-900">
                  {formatDate(plan.scheduled_date)}
                </time>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-zinc-950 dark:text-white">{plan.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {plan.assigned_by_name ? `Assigned by ${plan.assigned_by_name}` : 'Scheduled by you'} · {plan.exercises.length} exercise{plan.exercises.length === 1 ? '' : 's'}
                  </span>
                </span>
                <span aria-hidden="true" className="text-lg text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-orange-600">›</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {selected && (
        <WorkoutPlanModal
          key={selected.plan_id}
          plan={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  )
}
