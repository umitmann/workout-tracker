'use client'

import { useState, useTransition } from 'react'
import { logBodyWeight } from '@/app/actions/bodyweight'
import { exportReport, ReportRange } from '@/app/actions/reports'
import type { BodyWeightRow } from '@/lib/dal'
import { localDateStr } from '@/lib/localDate'

export default function BodyweightCard({ initial }: { initial: BodyWeightRow[] }) {
  const [entries, setEntries] = useState<BodyWeightRow[]>(initial)
  const [weight, setWeight] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [exporting, setExporting] = useState<ReportRange | null>(null)

  // entries come in newest-first
  const today = localDateStr()
  const latest = entries[0] ?? null
  const previous = entries[1] ?? null
  const delta = latest && previous ? latest.weight - previous.weight : null

  function handleLog() {
    const n = Number(weight)
    if (!weight || !Number.isFinite(n) || n <= 0) {
      setError('Enter a valid weight')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await logBodyWeight(n, today)
      if (res.error) {
        setError(res.error)
        return
      }
      // Optimistically update local trend (replace today's entry if present)
      setEntries((prev) => {
        const rest = prev.filter((e) => e.date !== today)
        return [{ date: today, weight: n }, ...rest].sort((a, b) => b.date.localeCompare(a.date))
      })
      setWeight('')
    })
  }

  async function handleExport(range: ReportRange) {
    setExporting(range)
    try {
      const res = await exportReport(range, today)
      if ('error' in res) {
        setError(res.error)
        return
      }
      const blob = new Blob([res.text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Bodyweight</p>
        {latest && (
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-zinc-900 dark:text-white">{latest.weight} kg</span>
            {delta != null && delta !== 0 && (
              <span className={`text-xs font-bold ${delta < 0 ? 'text-emerald-500' : 'text-orange-500'}`}>
                {delta < 0 ? '↓' : '↑'} {Math.abs(Math.round(delta * 10) / 10)} kg
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          placeholder="Today's weight (kg)"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLog()}
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm outline-none focus:border-orange-400 transition-colors"
        />
        <button
          onClick={handleLog}
          disabled={isPending}
          className="shrink-0 rounded-lg bg-orange-500 hover:bg-orange-600 px-4 py-2 text-sm font-bold text-white transition-colors disabled:opacity-40"
        >
          {isPending ? '…' : 'Log'}
        </button>
      </div>
      {error && <p className="text-xs font-medium text-red-500">{error}</p>}

      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Export for PT</p>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('week')}
            disabled={exporting !== null}
            className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 py-2.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 disabled:opacity-40 transition-colors"
          >
            {exporting === 'week' ? '…' : 'Last week'}
          </button>
          <button
            onClick={() => handleExport('month')}
            disabled={exporting !== null}
            className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 py-2.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 disabled:opacity-40 transition-colors"
          >
            {exporting === 'month' ? '…' : 'Last month'}
          </button>
        </div>
      </div>
    </div>
  )
}
