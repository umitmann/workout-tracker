'use client'

import { useRef, useState } from 'react'
import { isDraftableNumericInput, commitNumericDraft } from '@/lib/numericInput'

// Vertical ▲/value/▼ stepper for small bounded values (weight, reps, tempo
// seconds). Press-and-hold repeats; the value is tappable to type as a
// fallback. The typed text is kept as a raw draft string in local state and
// only committed (clamped, coerced to a number, sent to onChange) on blur or
// a ▲/▼ bump — never on every keystroke — so a partial decimal like "2." is
// never snapped to 0 while the user is still typing (finding L3).
export default function Stepper({
  value,
  onChange,
  min = 0,
  max = 10,
  step = 1,
  label,
  sublabel,
  decimal = false,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  label: string
  sublabel?: string
  decimal?: boolean
}) {
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [draft, setDraft] = useState(String(value))
  const [prevValue, setPrevValue] = useState(value)
  const [isEditing, setIsEditing] = useState(false)

  // Stay in sync with external value changes (bumps, parent resets) — but
  // only when the user isn't mid-keystroke in the text field. Adjusting
  // state during render (rather than in an effect) avoids the extra
  // commit-then-effect render pass for what is otherwise a plain prop sync.
  if (value !== prevValue) {
    setPrevValue(value)
    if (!isEditing) setDraft(String(value))
  }

  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const bump = (dir: 1 | -1) => {
    // Commit any in-progress typing first: the ▲/▼ pointerdown is
    // preventDefault'ed (keeps focus), so blur never fires and bumping the
    // raw prop would act on a stale value and strand the uncommitted draft.
    const base = isEditing ? commitNumericDraft(draft, { min, max }) : value
    setIsEditing(false)
    const next = clamp(Math.round((base + dir * step) * 100) / 100)
    setDraft(String(next))
    onChange(next)
  }

  function startHold(dir: 1 | -1) {
    bump(dir)
    holdRef.current = setInterval(() => bump(dir), 120)
  }
  function stopHold() {
    if (holdRef.current) clearInterval(holdRef.current)
    holdRef.current = null
  }

  function handleDraftChange(raw: string) {
    if (!isDraftableNumericInput(raw)) return
    setIsEditing(true)
    setDraft(raw)
  }
  function commitDraft() {
    setIsEditing(false)
    const committed = commitNumericDraft(draft, { min, max })
    setDraft(String(committed))
    onChange(committed)
  }

  const btn =
    'w-full h-6 flex items-center justify-center rounded-md text-xs leading-none select-none ' +
    'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 ' +
    'hover:bg-orange-500 hover:text-white active:bg-orange-600 disabled:opacity-30 disabled:hover:bg-zinc-100 dark:disabled:hover:bg-zinc-800 transition-colors'

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Label on top */}
      <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 text-center leading-tight">
        {label}
        {sublabel && <span className="block text-zinc-300 dark:text-zinc-600 normal-case tracking-normal">{sublabel}</span>}
      </span>
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
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        aria-label={label}
        value={draft}
        onChange={(e) => handleDraftChange(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => { if (e.key === 'Enter') commitDraft() }}
        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-1 py-1.5 text-center text-base font-black tabular-nums outline-none focus:border-orange-400"
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
    </div>
  )
}
