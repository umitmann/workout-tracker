import { type GuidedCoachVoice } from './guidedVoice'
import { isPackagedCoachVoice } from './guidedCoachAudio'

export type CoachPackCacheResult = {
  ok: boolean
  coach: GuidedCoachVoice
  count?: number
  error?: string
}

export async function cacheGuidedCoachPack(coach: GuidedCoachVoice): Promise<CoachPackCacheResult> {
  if (!isPackagedCoachVoice(coach)) {
    return { ok: false, coach, error: 'The device voice has no downloadable pack.' }
  }
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return { ok: false, coach, error: 'Offline audio is not supported in this browser.' }
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const worker = registration.active ?? navigator.serviceWorker.controller
    if (!worker) return { ok: false, coach, error: 'Install the app update, then try again.' }

    return await new Promise<CoachPackCacheResult>((resolve) => {
      const channel = new MessageChannel()
      const timeout = window.setTimeout(() => {
        channel.port1.close()
        resolve({ ok: false, coach, error: 'The download timed out. Check your connection and retry.' })
      }, 120_000)
      channel.port1.onmessage = (event: MessageEvent<CoachPackCacheResult>) => {
        window.clearTimeout(timeout)
        channel.port1.close()
        resolve(event.data)
      }
      worker.postMessage({ type: 'CACHE_COACH_PACK', coach }, [channel.port2])
    })
  } catch {
    return { ok: false, coach, error: 'Could not download this coach. Check your connection and retry.' }
  }
}
