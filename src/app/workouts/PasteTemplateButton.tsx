'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkoutClipboard } from '@/lib/WorkoutClipboardContext'
import { clipboardEntryToTemplateFields } from '@/lib/clipboardOps'
import { createTemplate, saveTemplateExercises } from '@/app/actions/templates'

export default function PasteTemplateButton() {
  const { clipboard, clear } = useWorkoutClipboard()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  if (!clipboard) return null

  const dateLabel = new Date(clipboard.sourceDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  function handlePaste() {
    if (!clipboard) return
    setError(null)
    startTransition(async () => {
      const result = await createTemplate(`Workout ${dateLabel}`)
      if ('error' in result) {
        setError(result.error ?? 'Could not create template')
        return
      }
      const saved = await saveTemplateExercises(
        result.id,
        `Workout ${dateLabel}`,
        // Tile 4: the clipboard carries the exact rows and their authored
        // uniform/per-set mode, so this cannot collapse a dropset to set #1.
        clipboard.entries.map((entry, order) => {
          const prescription = clipboardEntryToTemplateFields(entry)
          return {
            exerciseId: entry.exerciseId,
            sets: prescription.sets,
            reps: prescription.reps,
            weight: prescription.weight,
            duration_minutes: null,
            distance: null,
            set_details: prescription.setDetails,
            tempo: null,
            rest_seconds: null,
            order,
          }
        }),
      )
      if ('error' in saved) {
        setError(saved.error ?? 'Could not save template')
        return
      }
      clear()
      router.push(`/workouts/${result.id}`)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-orange-400 bg-orange-50 dark:bg-orange-950/20 px-4 py-3">
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
      {error && <p role="alert" className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
