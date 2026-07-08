'use client'

import { useEffect, useRef, useState } from 'react'
import { restViewAt } from '@/lib/restTimer'

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

// Non-blocking, self-contained rest timer docked in the exercise panel.
// Fixed mode counts down (adjustable ±15s live); variable counts up. Reports
// ACTUAL elapsed seconds on done. mode/target live in refs so mid-rest changes
// apply without remounting or a stale rAF closure.
export default function RestTimer({
  initialMode = 'fixed',
  initialTarget = 90,
  audio = true,
  onDone,
  onSettingsChange,
}: {
  initialMode?: 'fixed' | 'variable'
  initialTarget?: number
  audio?: boolean
  onDone: (elapsedSeconds: number) => void
  onSettingsChange?: (mode: 'fixed' | 'variable', target: number) => void
}) {
  const [elapsed, setElapsed] = useState(0)
  const [mode, setMode] = useState<'fixed' | 'variable'>(initialMode)
  const [target, setTarget] = useState(initialTarget)

  const startRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  const alertedRef = useRef(false)
  const modeRef = useRef(mode)
  const targetRef = useRef(target)
  modeRef.current = mode
  targetRef.current = target

  useEffect(() => {
    startRef.current = performance.now()
    function frame(now: number) {
      const e = (now - startRef.current) / 1000
      setElapsed(e)
      const { alarmDue } = restViewAt(modeRef.current, targetRef.current, e)
      if (alarmDue && !alertedRef.current) {
        alertedRef.current = true
        if (audio) beep()
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([80, 40, 80])
      }
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function adjust(delta: number) {
    const next = Math.max(15, targetRef.current + delta)
    if (next > elapsed) alertedRef.current = false // re-arm the alert
    setTarget(next)
    onSettingsChange?.(modeRef.current, next)
  }
  function switchMode(m: 'fixed' | 'variable') {
    setMode(m)
    alertedRef.current = false
    onSettingsChange?.(m, targetRef.current)
  }

  const { display, overtime } = restViewAt(mode, target, elapsed)

  return (
    <div className="rounded-2xl border-2 border-orange-400 bg-orange-50 dark:bg-orange-950/20 px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold uppercase tracking-widest text-orange-500 shrink-0">
            {overtime ? 'Rest over' : 'Resting'}
          </span>
          <span className={`text-2xl font-black tabular-nums ${overtime ? 'text-emerald-500' : 'text-zinc-900 dark:text-white'}`}>
            {overtime ? '+' : ''}{display}
          </span>
        </div>
        <button
          onClick={() => onDone(Math.round(elapsed))}
          className="shrink-0 rounded-lg bg-orange-500 hover:bg-orange-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors"
        >
          Done
        </button>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <button
          onClick={() => switchMode(mode === 'fixed' ? 'variable' : 'fixed')}
          className="rounded-full border border-orange-300 dark:border-orange-800 px-2.5 py-1 font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
        >
          {mode === 'fixed' ? 'Fixed' : 'Variable'}
        </button>
        {mode === 'fixed' && (
          <>
            <button onClick={() => adjust(-15)} className="rounded-full border border-orange-300 dark:border-orange-800 w-8 py-1 font-bold text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors">−15</button>
            <button onClick={() => adjust(15)} className="rounded-full border border-orange-300 dark:border-orange-800 w-8 py-1 font-bold text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors">+15</button>
            <span className="text-orange-500/70 font-semibold">target {target}s</span>
          </>
        )}
      </div>
    </div>
  )
}
