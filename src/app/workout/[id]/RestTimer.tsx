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
// ACTUAL elapsed seconds on done. The target lives in a ref so ±15 changes
// apply without remounting or a stale rAF closure; mode changes live in the
// explicit workout settings rather than on an easy-to-mistap running clock.
export default function RestTimer({
  initialMode = 'fixed',
  initialTarget = 90,
  initialElapsed = 0,
  audio = true,
  onDone,
  onSettingsChange,
}: {
  initialMode?: 'fixed' | 'variable'
  initialTarget?: number
  initialElapsed?: number
  audio?: boolean
  onDone: (elapsedSeconds: number) => void
  onSettingsChange?: (mode: 'fixed' | 'variable', target: number) => void
}) {
  const [elapsed, setElapsed] = useState(initialElapsed)
  const [mode] = useState<'fixed' | 'variable'>(initialMode)
  const [target, setTarget] = useState(initialTarget)

  const startRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  const alertedRef = useRef(false)
  const modeRef = useRef(mode)
  const targetRef = useRef(target)
  modeRef.current = mode
  targetRef.current = target

  useEffect(() => {
    startRef.current = performance.now() - initialElapsed * 1000
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
    const next = Math.max(5, targetRef.current + delta)
    if (next > elapsed) alertedRef.current = false // re-arm the alert
    setTarget(next)
    onSettingsChange?.(modeRef.current, next)
  }
  const { display, overtime } = restViewAt(mode, target, elapsed)

  return (
    <div className="workout-rest-running flex min-h-14 items-center gap-1.5 rounded-2xl border-2 border-orange-400 bg-orange-50 p-1.5 dark:bg-orange-950/25">
      <div className="workout-rest-clock min-w-0 flex-1 rounded-xl px-2 py-1">
        <span className="block text-[0.62rem] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-300">{overtime ? 'Rest over' : 'Resting'}</span>
        <span className={`block text-xl font-black tabular-nums ${overtime ? 'text-emerald-600' : 'text-zinc-950 dark:text-white'}`}>{overtime ? '+' : ''}{display}</span>
      </div>
      {mode === 'fixed' && (
        <>
          <button type="button" onClick={() => adjust(-15)} aria-label="Reduce rest by 15 seconds" className="workout-rest-adjust grid min-h-11 min-w-11 place-items-center rounded-xl border border-orange-300 text-xs font-black text-orange-700 hover:bg-white dark:border-orange-800 dark:text-orange-300 dark:hover:bg-zinc-900">−15</button>
          <button type="button" onClick={() => adjust(15)} aria-label="Add 15 seconds to rest" className="workout-rest-adjust grid min-h-11 min-w-11 place-items-center rounded-xl border border-orange-300 text-xs font-black text-orange-700 hover:bg-white dark:border-orange-800 dark:text-orange-300 dark:hover:bg-zinc-900">+15</button>
        </>
      )}
      <button
        type="button"
        onClick={() => onDone(Math.round(elapsed))}
        className="workout-rest-skip min-h-11 rounded-xl bg-orange-600 px-3 text-xs font-black text-white transition-colors hover:bg-orange-700"
      >
        Skip
      </button>
    </div>
  )
}
