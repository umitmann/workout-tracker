'use client'

import { useEffect, useRef, useState } from 'react'
import { isDraftableNumericInput, commitNumericDraft } from '@/lib/numericInput'
import Numpad from './Numpad'

// Detects a touch-primary device via pointer capability, not user-agent
// sniffing (D2 decision 3): `(pointer: coarse)` is true on phones/tablets
// and false on mouse/trackpad devices, including touch-capable laptops used
// with a mouse. Read once per mount on the client — SSR has no window, so
// this starts `false` (desktop behaviour) and settles after hydration.
function matchesCoarsePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse)').matches
}
function useIsTouchDevice(): boolean {
  // Lazy initializer reads the media query synchronously on first client
  // render (SSR has no window, so it falls back to `false` — desktop
  // behaviour — until hydration). The effect only subscribes to later
  // changes (e.g. a touch-capable laptop docking/undocking a mouse); it
  // never calls setState with the value it just read.
  const [isTouch, setIsTouch] = useState(matchesCoarsePointer)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(pointer: coarse)')
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return isTouch
}

// Vertical ▲/value/▼ stepper for small bounded values (weight, reps, tempo
// seconds). Press-and-hold repeats; the value is tappable to type as a
// fallback. The typed text is kept as a raw draft string in local state and
// only committed (clamped, coerced to a number, sent to onChange) on blur or
// a ▲/▼ bump — never on every keystroke — so a partial decimal like "2." is
// never snapped to 0 while the user is still typing (finding L3).
//
// ▲/▼ always step by 1 (D2 decision 2) — all sub-integer precision comes
// from the numpad's .25/.5/.75 fraction keys, never the arrows. On touch
// devices the value is readOnly and tapping it opens the custom Numpad
// (OS keyboard suppressed); on desktop the field stays natively editable.
// Manual entry (numpad or hardware keyboard) is authoritative over the
// arrows: it always overwrites the current value via onChange, and any
// later bump starts from that committed value (D2 decision 4) — this falls
// out of `bump()` always reading the just-updated `value` prop rather than
// tracking its own separate "last arrow value".
export default function Stepper({
  value,
  onChange,
  min = 0,
  max = 10,
  label,
  sublabel,
  decimal = false,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  label: string
  sublabel?: string
  decimal?: boolean
}) {
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [draft, setDraft] = useState(String(value))
  const [prevValue, setPrevValue] = useState(value)
  const [isEditing, setIsEditing] = useState(false)
  const [numpadOpen, setNumpadOpen] = useState(false)
  const isTouch = useIsTouchDevice()

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
    const next = clamp(Math.round((base + dir * 1) * 100) / 100)
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
  function openNumpad() {
    setIsEditing(true)
    setNumpadOpen(true)
  }
  function closeNumpad() {
    setNumpadOpen(false)
    commitDraft()
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
        inputMode={isTouch ? 'none' : decimal ? 'decimal' : 'numeric'}
        readOnly={isTouch}
        aria-label={label}
        aria-haspopup={isTouch ? 'dialog' : undefined}
        value={draft}
        onChange={(e) => handleDraftChange(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => { if (e.key === 'Enter') commitDraft() }}
        onClick={() => { if (isTouch) openNumpad() }}
        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-1 py-1.5 text-center text-base font-black tabular-nums outline-none focus:border-orange-400"
      />
      {numpadOpen && (
        <Numpad
          label={label}
          draft={draft}
          decimal={decimal}
          onDraftChange={handleDraftChange}
          onClose={closeNumpad}
        />
      )}
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
