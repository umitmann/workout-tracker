'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkoutClipboard } from '@/lib/WorkoutClipboardContext'
import { createTemplate, saveTemplateExercises } from '@/app/actions/templates'

export default function PasteTemplateButton() {
  const { clipboard, clear } = useWorkoutClipboard()
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (!clipboard) return null

  const dateLabel = new Date(clipboard.sourceDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  function handlePaste() {
    if (!clipboard) return
    startTransition(async () => {
      const result = await createTemplate(`Workout ${dateLabel}`)
      if ('error' in result) return
      await saveTemplateExercises(
        result.id,
        `Workout ${dateLabel}`,
        clipboard.entries.map((e, i) => ({
          exerciseId: e.exerciseId,
          sets: e.setCount,
          reps: e.reps ?? 0,
          weight: e.weight,
          order: i,
        })),
      )
      clear()
      router.push(`/workouts/${result.id}`)
    })
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-orange-400 bg-orange-50 dark:bg-orange-950/20 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-500">Clipboard</p>
        <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
          {clipboard.entries.length} exercise{clipboard.entries.length !== 1 ? 's' : ''} from {dateLabel}
        </p>
      </div>
      <button
        onClick={handlePaste}
        disabled={isPending}
        className="shrink-0 rounded-full bg-orange-500 hover:bg-orange-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-40 transition-colors"
      >
        {isPending ? '…' : 'Paste as template'}
      </button>
    </div>
  )
}
