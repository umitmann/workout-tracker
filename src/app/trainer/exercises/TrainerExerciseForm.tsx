'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { saveTrainerExerciseAction } from '@/app/actions/trainerExercises'
import type { TrainerExercise } from '@/lib/trainerExerciseTypes'
import { DETAILED_MUSCLES } from '@/lib/detailedMuscles'

const inputClass = 'min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white'

function ErrorText({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null
  return <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">{messages.join(' ')}</p>
}

const detailedLabelByKey = new Map(DETAILED_MUSCLES.map((muscle) => [muscle.key, muscle.label]))

function detailedLabels(values: string[] | null | undefined): string {
  return (values ?? []).map((value) => detailedLabelByKey.get(value) ?? value).join(', ')
}

export default function TrainerExerciseForm({
  exercise,
}: {
  exercise?: TrainerExercise
}) {
  const [state, action, pending] = useActionState(saveTrainerExerciseAction, null)
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!state?.success) return
    if (!exercise) formRef.current?.reset()
    router.refresh()
  }, [exercise, router, state?.success])

  const field = state?.fieldErrors

  return (
    <form
      ref={formRef}
      action={action}
      aria-label={exercise ? `Edit ${exercise.name}` : 'Create exercise'}
      className="space-y-5"
    >
      {exercise && <input type="hidden" name="exerciseId" value={exercise.id} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={`exercise-name-${exercise?.id ?? 'new'}`} className="text-sm font-bold text-zinc-900 dark:text-white">Exercise name</label>
          <input id={`exercise-name-${exercise?.id ?? 'new'}`} name="name" required maxLength={120} defaultValue={exercise?.name ?? ''} placeholder="e.g. Tempo goblet squat" className={`${inputClass} mt-2`} aria-invalid={Boolean(field?.name)} />
          <ErrorText messages={field?.name} />
        </div>
        <div>
          <label htmlFor={`exercise-category-${exercise?.id ?? 'new'}`} className="text-sm font-bold text-zinc-900 dark:text-white">Category</label>
          <input id={`exercise-category-${exercise?.id ?? 'new'}`} name="category" required maxLength={80} defaultValue={exercise?.category ?? ''} placeholder="strength, cardio…" className={`${inputClass} mt-2`} aria-invalid={Boolean(field?.category)} />
          <ErrorText messages={field?.category} />
        </div>
        <div>
          <label htmlFor={`exercise-equipment-${exercise?.id ?? 'new'}`} className="text-sm font-bold text-zinc-900 dark:text-white">Equipment <span className="font-normal text-zinc-500">optional</span></label>
          <input id={`exercise-equipment-${exercise?.id ?? 'new'}`} name="equipment" maxLength={120} defaultValue={exercise?.equipment ?? ''} placeholder="dumbbell" className={`${inputClass} mt-2`} aria-invalid={Boolean(field?.equipment)} />
          <ErrorText messages={field?.equipment} />
        </div>
        <div>
          <label htmlFor={`exercise-primary-${exercise?.id ?? 'new'}`} className="text-sm font-bold text-zinc-900 dark:text-white">Primary muscles</label>
          <input id={`exercise-primary-${exercise?.id ?? 'new'}`} name="primaryMuscles" defaultValue={exercise?.muscles?.join(', ') ?? ''} placeholder="quadriceps, glutes" className={`${inputClass} mt-2`} aria-describedby={`exercise-primary-hint-${exercise?.id ?? 'new'}`} aria-invalid={Boolean(field?.primaryMuscles)} />
          <p id={`exercise-primary-hint-${exercise?.id ?? 'new'}`} className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Separate muscle groups with commas.</p>
          <ErrorText messages={field?.primaryMuscles} />
        </div>
        <div>
          <label htmlFor={`exercise-secondary-${exercise?.id ?? 'new'}`} className="text-sm font-bold text-zinc-900 dark:text-white">Secondary muscles</label>
          <input id={`exercise-secondary-${exercise?.id ?? 'new'}`} name="secondaryMuscles" defaultValue={exercise?.muscles_secondary?.join(', ') ?? ''} placeholder="abdominals" className={`${inputClass} mt-2`} aria-invalid={Boolean(field?.secondaryMuscles)} />
          <ErrorText messages={field?.secondaryMuscles} />
        </div>
      </div>

      <details className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-700">
        <summary className="cursor-pointer text-sm font-bold text-zinc-900 dark:text-white">
          Anatomical detail <span className="font-normal text-zinc-500">optional</span>
        </summary>
        <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          Refine the broad groups for the 3D planner. Leave these empty to derive safe defaults from the exercise name and broad groups.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`exercise-primary-detail-${exercise?.id ?? 'new'}`} className="text-sm font-bold text-zinc-900 dark:text-white">Primary anatomy</label>
            <input
              id={`exercise-primary-detail-${exercise?.id ?? 'new'}`}
              name="primaryDetailedMuscles"
              list={`detailed-muscle-options-${exercise?.id ?? 'new'}`}
              defaultValue={detailedLabels(exercise?.muscles_detailed)}
              placeholder="Rectus femoris, Vastus lateralis"
              className={`${inputClass} mt-2`}
              aria-describedby={`exercise-primary-detail-hint-${exercise?.id ?? 'new'}`}
              aria-invalid={Boolean(field?.primaryDetailedMuscles)}
            />
            <p id={`exercise-primary-detail-hint-${exercise?.id ?? 'new'}`} className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Use comma-separated anatomical names matching the primary groups.</p>
            <ErrorText messages={field?.primaryDetailedMuscles} />
          </div>
          <div>
            <label htmlFor={`exercise-secondary-detail-${exercise?.id ?? 'new'}`} className="text-sm font-bold text-zinc-900 dark:text-white">Secondary anatomy</label>
            <input
              id={`exercise-secondary-detail-${exercise?.id ?? 'new'}`}
              name="secondaryDetailedMuscles"
              list={`detailed-muscle-options-${exercise?.id ?? 'new'}`}
              defaultValue={detailedLabels(exercise?.muscles_secondary_detailed)}
              placeholder="Gluteus maximus — compartment 1"
              className={`${inputClass} mt-2`}
              aria-invalid={Boolean(field?.secondaryDetailedMuscles)}
            />
            <ErrorText messages={field?.secondaryDetailedMuscles} />
          </div>
        </div>
        <datalist id={`detailed-muscle-options-${exercise?.id ?? 'new'}`}>
          {DETAILED_MUSCLES.map((muscle) => <option key={muscle.key} value={muscle.label} />)}
        </datalist>
      </details>

      <div>
        <label htmlFor={`exercise-instructions-${exercise?.id ?? 'new'}`} className="text-sm font-bold text-zinc-900 dark:text-white">Instructions</label>
        <textarea id={`exercise-instructions-${exercise?.id ?? 'new'}`} name="instructions" rows={5} maxLength={5000} defaultValue={exercise?.instructions?.join('\n') ?? ''} placeholder={'One coaching step per line\nBrace before descending\nDrive through the whole foot'} className={`${inputClass} mt-2 resize-y`} aria-describedby={`exercise-instructions-hint-${exercise?.id ?? 'new'}`} aria-invalid={Boolean(field?.instructions)} />
        <p id={`exercise-instructions-hint-${exercise?.id ?? 'new'}`} className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">One clear coaching step per line.</p>
        <ErrorText messages={field?.instructions} />
      </div>

      <div>
        <label htmlFor={`exercise-video-${exercise?.id ?? 'new'}`} className="text-sm font-bold text-zinc-900 dark:text-white">YouTube explanation <span className="font-normal text-zinc-500">optional</span></label>
        <input id={`exercise-video-${exercise?.id ?? 'new'}`} name="videoUrl" type="url" inputMode="url" maxLength={2048} defaultValue={exercise?.video_url ?? ''} placeholder="https://youtu.be/…" className={`${inputClass} mt-2`} aria-describedby={`exercise-video-hint-${exercise?.id ?? 'new'}`} aria-invalid={Boolean(field?.videoUrl)} />
        <p id={`exercise-video-hint-${exercise?.id ?? 'new'}`} className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">YouTube links are embedded with the privacy-enhanced youtube-nocookie domain.</p>
        <ErrorText messages={field?.videoUrl} />
      </div>

      <fieldset>
        <legend className="text-sm font-bold text-zinc-900 dark:text-white">Who can find this exercise?</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50 dark:border-zinc-700 dark:has-[:checked]:bg-orange-950/30">
            <input type="radio" name="visibility" value="public" defaultChecked={(exercise?.visibility ?? 'public') === 'public'} className="mt-1 h-4 w-4 accent-orange-600" />
            <span><span className="block text-sm font-bold text-zinc-900 dark:text-white">Everyone</span><span className="mt-0.5 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">All signed-in athletes can find and use it.</span></span>
          </label>
          <label className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50 dark:border-zinc-700 dark:has-[:checked]:bg-orange-950/30">
            <input type="radio" name="visibility" value="clients" defaultChecked={exercise?.visibility === 'clients'} className="mt-1 h-4 w-4 accent-orange-600" />
            <span><span className="block text-sm font-bold text-zinc-900 dark:text-white">My active clients</span><span className="mt-0.5 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">Only you and athletes actively training with you can discover it.</span></span>
          </label>
        </div>
        <ErrorText messages={field?.visibility} />
      </fieldset>

      {state && (
        <p role={state.success ? 'status' : 'alert'} className={`rounded-xl p-3 text-sm font-medium ${state.success ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'}`}>
          {state.message}
        </p>
      )}

      <button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-orange-600 px-5 text-sm font-black text-white transition hover:bg-orange-700 disabled:cursor-wait disabled:opacity-60">
        {pending ? 'Saving…' : exercise ? 'Save changes' : 'Create exercise'}
      </button>
    </form>
  )
}
