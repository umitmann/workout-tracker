'use client'

import { useEffect, useState } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallAppCard() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [platform, setPlatform] = useState({ standalone: false, ios: false, ready: false })
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
    const detectionFrame = requestAnimationFrame(() => {
      setPlatform({
        standalone: window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true,
        ios: /iphone|ipad|ipod/i.test(navigator.userAgent),
        ready: true,
      })
    })
    const capturePrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as InstallPromptEvent)
    }
    const installed = () => {
      setPlatform((current) => ({ ...current, standalone: true, ready: true }))
      setPromptEvent(null)
      setMessage('Workout Tracker is installed.')
    }
    window.addEventListener('beforeinstallprompt', capturePrompt)
    window.addEventListener('appinstalled', installed)
    return () => {
      cancelAnimationFrame(detectionFrame)
      window.removeEventListener('beforeinstallprompt', capturePrompt)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])

  async function install() {
    if (!promptEvent) return
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    setMessage(choice.outcome === 'accepted' ? 'Installation started.' : 'Installation cancelled.')
    setPromptEvent(null)
  }

  return (
    <section aria-labelledby="install-app-heading" className="rounded-[1.6rem] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-7">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Phone app</p>
      <h2 id="install-app-heading" className="mt-2 text-2xl font-black tracking-tight text-zinc-950 dark:text-white">Install Workout Tracker</h2>
      {platform.standalone ? (
        <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">Installed — you are using the standalone app.</p>
      ) : promptEvent ? (
        <>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Add the Android app to your home screen for a full-screen launch and app icon.</p>
          <button type="button" onClick={install} className="mt-4 min-h-12 rounded-xl bg-orange-600 px-5 text-sm font-black text-white hover:bg-orange-700">Install app</button>
        </>
      ) : platform.ios ? (
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          <li>Open this page in Safari.</li>
          <li>Tap the Share button.</li>
          <li>Choose <strong className="text-zinc-900 dark:text-white">Add to Home Screen</strong>, then Add.</li>
        </ol>
      ) : platform.ready ? (
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Use your browser menu and choose <strong className="text-zinc-900 dark:text-white">Install app</strong> or <strong className="text-zinc-900 dark:text-white">Add to Home screen</strong>. Installation becomes available over HTTPS in a supported browser.</p>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">Checking installation support…</p>
      )}
      {message && <p role="status" className="mt-3 text-sm font-semibold text-zinc-600 dark:text-zinc-300">{message}</p>}
      <p className="mt-4 text-xs leading-5 text-zinc-500">For privacy, workout and account pages are never stored in the offline cache. Reconnect before logging or saving.</p>
    </section>
  )
}
