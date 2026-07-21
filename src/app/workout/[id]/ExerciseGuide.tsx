'use client'

import { useEffect, useRef, useState } from 'react'
import { TempoConfig, TempoPhase, secondsLeft } from '@/lib/tempo'
import {
  activeElapsedSeconds,
  guidedRestAudioCue,
  guidedStateAt,
  stopEarlyReps,
  READY_SECONDS,
  readySecondsLeft,
  resumedStartTime,
} from '@/lib/guidedTimer'
import {
  GuidedVoiceSettings,
  guidedPhaseAnnouncement,
  guidedReadyAnnouncement,
  guidedRestAnnouncement,
} from '@/lib/guidedVoice'
import {
  cancelGuidedCoachAudio,
  guidedPhaseCoachCues,
  guidedReadyCoachCues,
  guidedRestCoachCues,
  speakGuidedCoach,
} from '@/lib/guidedCoachAudio'
import GuidedVoiceSettingsFields from './GuidedVoiceSettings'
import Modal from '@/components/Modal'

export type GuideSet = { localId: string; goalReps: number; weight: number | null }
export type GuideResult = {
  localId: string
  reps: number
  difficulty?: number | null
  restSeconds?: number
}
export type GuidedRestHandoff = { localId: string; elapsedSeconds: number }

const PHASE_BG: Record<TempoPhase, string> = {
  down: 'bg-sky-600',
  rest: 'bg-amber-500',
  up: 'bg-emerald-600',
  hold: 'bg-amber-500',
}
const PHASE_TONE: Record<TempoPhase, number> = { down: 392, rest: 330, up: 523, hold: 440 }

function tone(ctx: AudioContext, freq: number, ms: number, volume = 0.25) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = freq
  osc.type = 'sine'
  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + ms / 1000)
}

type Mode = 'ready' | 'set' | 'rest'

// Guides an entire exercise: GET READY → DRUH set → optional rest → next set.
// Every exit goes through WorkoutLogger's editable review. If the athlete exits
// during rest, the main rest dock receives the elapsed value and continues from
// that exact counter instead of restarting at zero.
export default function ExerciseGuide({
  exerciseName,
  tempo,
  sets,
  restSeconds,
  restBetweenSets = true,
  voiceSettingsDefault,
  onVoiceSettingsChange,
  techniqueCue = '',
  onTechniqueCueChange,
  onDone,
}: {
  exerciseName: string
  tempo: TempoConfig
  sets: GuideSet[]
  restSeconds: number
  restBetweenSets?: boolean
  voiceSettingsDefault: GuidedVoiceSettings
  onVoiceSettingsChange?: (settings: GuidedVoiceSettings) => void
  techniqueCue?: string
  onTechniqueCueChange?: (cue: string) => void
  onDone: (results: GuideResult[], activeRest?: GuidedRestHandoff) => void
}) {
  const [voiceSettings, setVoiceSettings] = useState(voiceSettingsDefault)
  const [showVoiceSettings, setShowVoiceSettings] = useState(false)
  const [mode, setMode] = useState<Mode>('ready')
  const [idx, setIdx] = useState(0)
  const [view, setView] = useState(() => guidedStateAt(tempo, sets[0]?.goalReps ?? 1, 0))
  const [restLeft, setRestLeft] = useState(restSeconds)
  const [readyLeft, setReadyLeft] = useState(READY_SECONDS)
  const [paused, setPaused] = useState(false)
  const [difficultyBySet, setDifficultyBySet] = useState<Record<string, number | null>>({})

  const resultsRef = useRef<GuideResult[]>([])
  const modeRef = useRef<Mode>('ready')
  const idxRef = useRef(0)
  const startRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const frameRef = useRef<(now: number) => void>(() => {})
  const pausedRef = useRef(false)
  const pausedElapsedRef = useRef(0)
  const ctxRef = useRef<AudioContext | null>(null)
  const voiceSettingsRef = useRef(voiceSettings)
  const techniqueCueRef = useRef(techniqueCue)
  const lastPhaseRef = useRef('')
  const lastSpokenRepRef = useRef(0)
  const lastRestCueSecondRef = useRef(-1)
  const doneRef = useRef(false)
  voiceSettingsRef.current = voiceSettings
  techniqueCueRef.current = techniqueCue

  useEffect(() => {
    if (sets.length === 0) { onDone([]); return }
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      ctxRef.current = new AudioContext()
      ctxRef.current.resume?.().catch(() => {})
    }
    startRef.current = performance.now()
    announceReady(0)
    frameRef.current = loop
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      ctxRef.current?.close().catch(() => {})
      cancelGuidedCoachAudio()
    }
    // The guide is a run snapshot: changing its inputs remounts it upstream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function upsertResult(result: GuideResult) {
    const existing = resultsRef.current.findIndex((entry) => entry.localId === result.localId)
    if (existing === -1) resultsRef.current.push(result)
    else resultsRef.current[existing] = { ...resultsRef.current[existing], ...result }
  }

  function restElapsedSeconds() {
    return Math.round(elapsedNow())
  }

  function recordRest(elapsedSeconds: number) {
    const current = sets[idxRef.current]
    if (!current) return
    upsertResult({ localId: current.localId, reps: resultsRef.current.find((r) => r.localId === current.localId)?.reps ?? 0, restSeconds: elapsedSeconds })
  }

  function loop(now: number) {
    if (pausedRef.current || doneRef.current) return
    const elapsed = activeElapsedSeconds(startRef.current, now)

    if (modeRef.current === 'ready') {
      const left = readySecondsLeft(elapsed)
      setReadyLeft(left)
      if (elapsed >= READY_SECONDS) { beginSet(); return }
    } else if (modeRef.current === 'set') {
      const current = sets[idxRef.current]
      const state = guidedStateAt(tempo, current.goalReps, elapsed)
      const phaseKey = `${state.rep}:${state.phase}`
      if (phaseKey !== lastPhaseRef.current) {
        lastPhaseRef.current = phaseKey
        const currentSettings = voiceSettingsRef.current
        if (currentSettings.rhythmCues && ctxRef.current) tone(ctxRef.current, PHASE_TONE[state.phase], 140)
        if (currentSettings.enabled) {
          const announceRep = lastSpokenRepRef.current !== state.rep
          const announcement = guidedPhaseAnnouncement({
            mode: currentSettings.coachingMode,
            phase: state.phase,
            rep: state.rep,
            goalReps: current.goalReps,
            announceRep,
          })
          if (announcement) {
            speakGuidedCoach(currentSettings, guidedPhaseCoachCues({
              mode: currentSettings.coachingMode,
              phase: state.phase,
              rep: state.rep,
              goalReps: current.goalReps,
              announceRep,
            }), announcement)
          }
          if (announceRep && announcement) lastSpokenRepRef.current = state.rep
        }
        if (currentSettings.rhythmCues && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(45)
      }
      setView(state)
      if (state.finished) { completeSet(current.goalReps); return }
    } else {
      const left = Math.max(0, restSeconds - elapsed)
      setRestLeft(left)
      const wholeSecondsLeft = secondsLeft(left)
      if (wholeSecondsLeft !== lastRestCueSecondRef.current) {
        lastRestCueSecondRef.current = wholeSecondsLeft
        const cue = guidedRestAudioCue(restSeconds, wholeSecondsLeft)
        const currentSettings = voiceSettingsRef.current
        if (cue && currentSettings.restCues === 'chimes' && ctxRef.current) {
          if (cue === 'halfway') tone(ctxRef.current, 520, 180, 0.25)
          if (cue === 'complete') tone(ctxRef.current, 660, 250, 0.3)
        }
        if (cue && currentSettings.enabled) {
          const announcement = guidedRestAnnouncement(currentSettings.restCues, cue)
          if (announcement) speakGuidedCoach(currentSettings, guidedRestCoachCues(currentSettings.restCues, cue), announcement)
        }
      }
      if (elapsed >= restSeconds) {
        recordRest(Math.round(restSeconds))
        toReady(true)
        return
      }
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  function beginSet() {
    modeRef.current = 'set'
    setMode('set')
    lastPhaseRef.current = ''
    lastSpokenRepRef.current = 0
    startRef.current = performance.now()
    rafRef.current = requestAnimationFrame(loop)
  }

  function toReady(afterRest = false) {
    idxRef.current += 1
    setIdx(idxRef.current)
    modeRef.current = 'ready'
    setMode('ready')
    setReadyLeft(READY_SECONDS)
    startRef.current = performance.now()
    announceReady(idxRef.current, voiceSettingsRef.current, !afterRest)
    rafRef.current = requestAnimationFrame(loop)
  }

  function completeSet(reps: number) {
    const current = sets[idxRef.current]
    upsertResult({ localId: current.localId, reps, difficulty: difficultyBySet[current.localId] ?? null })
    if (idxRef.current >= sets.length - 1) { finish(); return }
    if (!restBetweenSets) { toReady(); return }
    modeRef.current = 'rest'
    setMode('rest')
    setRestLeft(restSeconds)
    lastRestCueSecondRef.current = -1
    startRef.current = performance.now()
    rafRef.current = requestAnimationFrame(loop)
  }

  function stopSet() {
    if (doneRef.current || modeRef.current !== 'set') return
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    completeSet(stopEarlyReps(tempo, sets[idxRef.current].goalReps, elapsedNow()))
  }

  function skipRest() {
    if (doneRef.current || modeRef.current !== 'rest') return
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    recordRest(restElapsedSeconds())
    toReady()
  }

  function skipReady() {
    if (doneRef.current || modeRef.current !== 'ready') return
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    beginSet()
  }

  function setCurrentDifficulty(value: number) {
    const current = sets[idxRef.current]
    if (!current) return
    const nextValue = difficultyBySet[current.localId] === value ? null : value
    setDifficultyBySet((currentValues) => ({ ...currentValues, [current.localId]: nextValue }))
    const result = resultsRef.current.find((entry) => entry.localId === current.localId)
    if (result) upsertResult({ ...result, difficulty: nextValue })
  }

  function elapsedNow() {
    return pausedRef.current
      ? pausedElapsedRef.current
      : activeElapsedSeconds(startRef.current, performance.now())
  }

  function togglePause() {
    if (doneRef.current) return
    if (!pausedRef.current) {
      pausedElapsedRef.current = activeElapsedSeconds(startRef.current, performance.now())
      pausedRef.current = true
      setPaused(true)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      cancelGuidedCoachAudio()
      return
    }

    startRef.current = resumedStartTime(performance.now(), pausedElapsedRef.current)
    pausedRef.current = false
    setPaused(false)
    if (modeRef.current === 'set') lastPhaseRef.current = ''
    if (modeRef.current === 'rest') lastRestCueSecondRef.current = -1
    rafRef.current = requestAnimationFrame(frameRef.current)
  }

  function announceReady(
    setIndex: number,
    settings = voiceSettingsRef.current,
    interrupt = true,
  ) {
    const current = sets[setIndex]
    if (!current) return
    const announcement = guidedReadyAnnouncement({
      enabled: settings.enabled,
      mode: settings.coachingMode,
      exerciseName,
      setNumber: setIndex + 1,
      goalReps: current.goalReps,
      weight: current.weight,
      techniqueCue: techniqueCueRef.current,
    })
    if (announcement) speakGuidedCoach(settings, guidedReadyCoachCues(), announcement, interrupt)
  }

  function changeVoiceSettings(next: GuidedVoiceSettings) {
    voiceSettingsRef.current = next
    setVoiceSettings(next)
    onVoiceSettingsChange?.(next)
    cancelGuidedCoachAudio()
    lastPhaseRef.current = ''
    lastSpokenRepRef.current = 0
  }

  function toggleVoice() {
    const next = { ...voiceSettingsRef.current, enabled: !voiceSettingsRef.current.enabled }
    changeVoiceSettings(next)
    if (next.enabled && modeRef.current === 'ready') announceReady(idxRef.current, next)
  }

  function openVoiceSettings() {
    if (!pausedRef.current) togglePause()
    setShowVoiceSettings(true)
  }

  function closeVoiceSettings() {
    setShowVoiceSettings(false)
  }

  // Back/Exit never silently commits or discards. It captures an in-progress
  // set (including 0 reps), hands off an in-progress rest, and opens the
  // editable review in the logger.
  function exitForReview() {
    if (doneRef.current) return
    const current = sets[idxRef.current]
    let activeRest: GuidedRestHandoff | undefined
    if (current && modeRef.current === 'set') {
      upsertResult({
        localId: current.localId,
        reps: stopEarlyReps(tempo, current.goalReps, elapsedNow()),
        difficulty: difficultyBySet[current.localId] ?? null,
      })
    } else if (current && modeRef.current === 'ready' && !resultsRef.current.some((result) => result.localId === current.localId)) {
      upsertResult({ localId: current.localId, reps: 0, difficulty: difficultyBySet[current.localId] ?? null })
    } else if (current && modeRef.current === 'rest') {
      const elapsedSeconds = restElapsedSeconds()
      recordRest(elapsedSeconds)
      activeRest = { localId: current.localId, elapsedSeconds }
    }
    finish(activeRest)
  }

  function finish(activeRest?: GuidedRestHandoff) {
    if (doneRef.current) return
    doneRef.current = true
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    cancelGuidedCoachAudio()
    onDone([...resultsRef.current], activeRest)
  }

  const setNum = Math.min(idx + 1, sets.length)
  const currentDifficulty = sets[idx] ? difficultyBySet[sets[idx].localId] ?? null : null
  const bg = mode === 'set' ? PHASE_BG[view.phase] : mode === 'rest' ? 'bg-orange-600' : 'bg-zinc-800'

  return (
    <div className={`fixed inset-0 z-[80] flex flex-col ${bg} text-white transition-colors duration-150`}>
      <div className="flex items-center justify-between px-4 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
        <p className="min-w-0 flex-1 truncate text-sm font-bold uppercase tracking-widest text-white/80">
          {exerciseName} · Set {setNum}/{sets.length}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={togglePause} className="grid min-h-11 min-w-11 place-items-center rounded-full bg-white/15 px-3 text-xs font-bold transition-colors hover:bg-white/25" aria-label={paused ? 'Resume guidance' : 'Pause guidance'} aria-pressed={paused}>
            {paused ? '▶' : '⏸'}
          </button>
          <button type="button" onClick={toggleVoice} className="grid min-h-11 min-w-11 place-items-center rounded-full bg-white/15 px-3 text-xs font-bold transition-colors hover:bg-white/25" aria-label={voiceSettings.enabled ? 'Turn voice off' : 'Turn voice on'} aria-pressed={voiceSettings.enabled}>
            {voiceSettings.enabled ? '🔊' : '🔇'}
          </button>
          <button type="button" onClick={openVoiceSettings} className="grid min-h-11 min-w-11 place-items-center rounded-full bg-white/15 px-3 text-base transition-colors hover:bg-white/25" aria-label="Voice settings" aria-expanded={showVoiceSettings}>
            ⚙
          </button>
          <button onClick={exitForReview} className="min-h-11 rounded-full bg-white/15 px-3 text-xs font-bold uppercase tracking-wide transition-colors hover:bg-white/25">
            Review &amp; exit
          </button>
        </div>
      </div>

      {paused && <p role="status" className="mx-auto mt-4 rounded-full bg-black/25 px-4 py-2 text-sm font-black tracking-[0.25em]">PAUSED</p>}

      {showVoiceSettings && (
        <Modal
          title="Voice settings"
          onClose={closeVoiceSettings}
          backdropClassName="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 px-3 pt-[max(5rem,env(safe-area-inset-top))]"
          panelClassName="max-h-[calc(100dvh-6rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-white/20 bg-zinc-900/95 p-3 text-white shadow-2xl outline-none backdrop-blur"
        >
          <>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-black">Guidance settings</p>
              <button type="button" onClick={closeVoiceSettings} className="min-h-11 rounded-xl bg-white/10 px-4 text-sm font-bold hover:bg-white/20">Done</button>
            </div>
            <GuidedVoiceSettingsFields
              settings={voiceSettings}
              onChange={changeVoiceSettings}
              techniqueCue={techniqueCue}
              onTechniqueCueChange={onTechniqueCueChange}
              showRestCues
              appearance="overlay"
            />
          </>
        </Modal>
      )}

      {mode === 'ready' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-3xl font-black tracking-widest text-white/90">GET READY</p>
          <p className="text-lg font-semibold text-white/70">Set {setNum} · {sets[idx]?.weight ? `${sets[idx]?.weight}kg × ` : ''}{sets[idx]?.goalReps} reps</p>
          {voiceSettings.coachingMode === 'technique' && techniqueCue.trim() && (
            <p className="max-w-md rounded-xl bg-black/20 px-4 py-2 text-sm font-bold text-white/90">Cue: {techniqueCue.trim()}</p>
          )}
          <p className="text-[clamp(6rem,28vw,9rem)] font-black leading-none tabular-nums drop-shadow">{readyLeft}</p>
        </div>
      ) : mode === 'set' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
          <p className={`text-7xl leading-none drop-shadow ${view.phase === 'down' ? 'translate-y-1' : view.phase === 'up' ? '-translate-y-1' : ''} transition-transform`}>{view.icon}</p>
          <p className="text-6xl font-black leading-none tracking-tight drop-shadow sm:text-7xl">{view.verb}</p>
          <p className="text-lg font-semibold text-white/80">{view.sub}</p>
          <p className="mt-5 text-[clamp(6rem,25vw,8rem)] font-black leading-none tabular-nums drop-shadow">{view.secondsLeft}</p>
          <p className="mt-3 text-sm font-bold uppercase tracking-[0.25em] text-white/70">Rep {view.rep} / {sets[idx]?.goalReps}</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-6 py-4 text-center">
          <p className="text-4xl font-black tracking-widest drop-shadow">REST</p>
          <p className="text-[clamp(5.5rem,25vw,8rem)] font-black leading-none tabular-nums drop-shadow">{secondsLeft(restLeft)}</p>
          <p className="text-sm font-semibold uppercase tracking-widest text-white/70">next: set {Math.min(idx + 2, sets.length)}</p>
          <fieldset className="mt-3">
            <legend className="mb-2 text-xs font-bold uppercase tracking-widest text-white/70">Difficulty for set {setNum}</legend>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`Difficulty ${value} of 5`}
                  aria-pressed={currentDifficulty === value}
                  onClick={() => setCurrentDifficulty(value)}
                  className={`grid size-11 place-items-center rounded-full border-2 text-sm font-black transition ${currentDifficulty === value ? 'border-white bg-white text-orange-600' : 'border-white/40 bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      <div className="px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {mode === 'set' && (
          <button onClick={stopSet} className="w-full rounded-2xl bg-white py-5 text-lg font-black text-zinc-900 transition-colors hover:bg-white/90">
            Stop set{restBetweenSets ? ' & rest' : ''}
          </button>
        )}
        {mode === 'rest' && (
          <button onClick={skipRest} className="w-full rounded-2xl bg-white py-5 text-lg font-black text-zinc-900 transition-colors hover:bg-white/90">
            Skip rest
          </button>
        )}
        {mode === 'ready' && (
          <button onClick={skipReady} className="w-full rounded-2xl bg-white py-5 text-lg font-black text-zinc-900 transition-colors hover:bg-white/90">
            Start now
          </button>
        )}
      </div>
    </div>
  )
}
