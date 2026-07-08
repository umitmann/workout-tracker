'use client'

import { useEffect, useRef, useState } from 'react'

function beep() {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = 660
  osc.type = 'sine'
  gain.gain.setValueAtTime(0.001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.4)
  osc.onended = () => ctx.close().catch(() => {})
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

// Non-blocking rest timer. Fixed mode counts down from targetSeconds and alerts
// at zero; variable mode counts up. onDone reports the ACTUAL elapsed seconds.
export default function RestTimer({
  mode,
  targetSeconds = 90,
  audio = true,
  onDone,
}: {
  mode: 'fixed' | 'variable'
  targetSeconds?: number
  audio?: boolean
  onDone: (elapsedSeconds: number) => void
}) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  const alertedRef = useRef(false)

  useEffect(() => {
    startRef.current = performance.now()
    function frame(now: number) {
      const e = (now - startRef.current) / 1000
      setElapsed(e)
      if (mode === 'fixed' && !alertedRef.current && e >= targetSeconds) {
        alertedRef.current = true
        if (audio) beep()
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([80, 40, 80])
      }
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const remaining = targetSeconds - elapsed
  const display = mode === 'fixed' ? fmt(Math.abs(remaining)) : fmt(elapsed)
  const overtime = mode === 'fixed' && remaining < 0

  return (
    <div className="rounded-2xl border-2 border-orange-400 bg-orange-50 dark:bg-orange-950/20 px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-orange-500">
          {mode === 'fixed' ? (overtime ? 'Rest over' : 'Resting') : 'Resting'}
        </span>
        <span className={`text-xl font-black tabular-nums ${overtime ? 'text-emerald-500' : 'text-zinc-900 dark:text-white'}`}>
          {mode === 'fixed' && overtime ? '+' : ''}{display}
        </span>
      </div>
      <button
        onClick={() => onDone(Math.round(elapsed))}
        className="shrink-0 rounded-lg bg-orange-500 hover:bg-orange-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors"
      >
        Done resting
      </button>
    </div>
  )
}
