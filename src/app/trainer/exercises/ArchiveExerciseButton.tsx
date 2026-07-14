'use client'

import { useActionState } from 'react'
import { archiveTrainerExerciseAction } from '@/app/actions/trainerExercises'

export default function ArchiveExerciseButton({ exerciseId }: { exerciseId: number }) {
  const [state, action, pending] = useActionState(archiveTrainerExerciseAction, null)
  return (
    <form action={action} className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <input type="hidden" name="exerciseId" value={exerciseId} />
      {state && <p role={state.success ? 'status' : 'alert'} className={`mb-3 text-xs font-medium ${state.success ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>{state.message}</p>}
      <button type="submit" disabled={pending || state?.success} className="min-h-11 rounded-xl px-3 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40">
        {pending ? 'Archiving…' : 'Archive exercise'}
      </button>
    </form>
  )
}
