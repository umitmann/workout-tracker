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
        // Tile 4: the clipboard now carries the exact per-set list, so the
        // template is built losslessly via `set_details` (one row per
        // copied set) instead of collapsing to a single `sets x reps x
        // weight` count from set #1.
        clipboard.entries.map((e, i) => ({
          exerciseId: e.exerciseId,
          sets: e.sets.length,
          reps: e.sets[0]?.reps ?? null,
          weight: e.sets[0]?.weight ?? null,
          duration_minutes: null,
          distance: null,
          set_details: e.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
          tempo: null,
          rest_seconds: null,
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
