'use client'

import { useRef } from 'react'

// Vertical ▲/value/▼ stepper for small bounded values (tempo seconds, reps).
// Press-and-hold repeats; the value is tappable to type as a fallback.
export default function Stepper({
  value,
  onChange,
  min = 0,
  max = 10,
  step = 1,
  label,
  sublabel,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  label: string
  sublabel?: string
}) {
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const bump = (dir: 1 | -1) => onChange(clamp(Math.round((value + dir * step) * 100) / 100))

  function startHold(dir: 1 | -1) {
    bump(dir)
    holdRef.current = setInterval(() => bump(dir), 120)
  }
  function stopHold() {
    if (holdRef.current) clearInterval(holdRef.current)
    holdRef.current = null
  }

  const btn =
    'w-full h-9 flex items-center justify-center rounded-lg text-lg leading-none select-none ' +
    'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 ' +
    'hover:bg-orange-500 hover:text-white active:bg-orange-600 disabled:opacity-30 disabled:hover:bg-zinc-100 dark:disabled:hover:bg-zinc-800 transition-colors'

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onPointerDown={(e) => { e.preventDefault(); startHold(1) }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        className={btn}
      >
        ▲
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-1 py-2 text-center text-lg font-black tabular-nums outline-none focus:border-orange-400"
      />
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onPointerDown={(e) => { e.preventDefault(); startHold(-1) }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        className={btn}
      >
        ▼
      </button>
      <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 text-center leading-tight">
        {label}
        {sublabel && <span className="block text-zinc-300 dark:text-zinc-600 normal-case tracking-normal">{sublabel}</span>}
      </span>
    </div>
  )
}
