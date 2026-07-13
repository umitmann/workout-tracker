'use client'

import Link from 'next/link'
import { useActionState, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { signUpWithEmail, signInWithEmail } from '@/app/actions/auth'

const inputClass = 'min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white'

export default function AuthPanel() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')
  const [tab, setTab] = useState<'signin' | 'register'>('signin')
  const signInTabRef = useRef<HTMLButtonElement>(null)
  const registerTabRef = useRef<HTMLButtonElement>(null)
  const [signInState, signInAction, signInPending] = useActionState(signInWithEmail, null)
  const [signUpState, signUpAction, signUpPending] = useActionState(signUpWithEmail, null)

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  function selectTab(nextTab: 'signin' | 'register') {
    setTab(nextTab)
    const nextButton = nextTab === 'signin' ? signInTabRef.current : registerTabRef.current
    nextButton?.focus()
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      selectTab(tab === 'signin' ? 'register' : 'signin')
    } else if (event.key === 'Home') {
      event.preventDefault()
      selectTab('signin')
    } else if (event.key === 'End') {
      event.preventDefault()
      selectTab('register')
    }
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400">Your training space</p>
      <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-zinc-950 dark:text-white">
        {tab === 'signin' ? 'Welcome back.' : 'Start your training log.'}
      </h2>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {tab === 'signin'
          ? 'Pick up where you left off—your plans and history are ready.'
          : 'Create your private account. Trainer access stays off until you explicitly connect and share.'}
      </p>

      {urlError === 'registration_disabled' && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">Registration is currently closed.</p>}
      {urlError === 'invalid_link' && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">That link is invalid or has expired.</p>}

      <div role="tablist" aria-label="Account access" className="mt-8 grid grid-cols-2 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
        <button
          ref={signInTabRef}
          id="account-signin-tab"
          type="button"
          role="tab"
          aria-selected={tab === 'signin'}
          aria-controls="account-signin-panel"
          tabIndex={tab === 'signin' ? 0 : -1}
          onClick={() => selectTab('signin')}
          onKeyDown={handleTabKeyDown}
          className={`min-h-11 rounded-lg px-4 text-sm font-bold transition ${tab === 'signin' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'}`}
        >
          Sign in
        </button>
        <button
          ref={registerTabRef}
          id="account-register-tab"
          type="button"
          role="tab"
          aria-selected={tab === 'register'}
          aria-controls="account-register-panel"
          tabIndex={tab === 'register' ? 0 : -1}
          onClick={() => selectTab('register')}
          onKeyDown={handleTabKeyDown}
          className={`min-h-11 rounded-lg px-4 text-sm font-bold transition ${tab === 'register' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'}`}
        >
          Register
        </button>
      </div>

      {tab === 'signin' ? (
        <form
          id="account-signin-panel"
          role="tabpanel"
          aria-labelledby="account-signin-tab"
          action={signInAction}
          className="mt-6 flex flex-col gap-4"
        >
          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Email
            <input name="email" type="email" placeholder="Email" autoComplete="email" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Password
            <input name="password" type="password" placeholder="Password" autoComplete="current-password" required className={inputClass} />
          </label>
          {signInState?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{signInState.error}</p>}
          <button type="submit" disabled={signInPending} className="min-h-12 w-full rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white shadow-sm shadow-orange-900/20 transition hover:bg-orange-700 disabled:opacity-50">
            {signInPending ? 'Signing in…' : 'Sign in'}
          </button>
          <Link href="/forgot-password" className="inline-flex min-h-11 items-center justify-center text-sm font-semibold text-zinc-500 hover:text-orange-700 dark:hover:text-orange-300">Forgot password?</Link>
        </form>
      ) : (
        <form
          id="account-register-panel"
          role="tabpanel"
          aria-labelledby="account-register-tab"
          action={signUpAction}
          className="mt-6 flex flex-col gap-4"
        >
          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Email
            <input name="email" type="email" placeholder="Email" autoComplete="email" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Password
            <input name="password" type="password" placeholder="Password (min. 6 characters)" autoComplete="new-password" required minLength={6} className={inputClass} />
          </label>
          {signUpState?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{signUpState.error}</p>}
          {signUpState?.message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">{signUpState.message}</p>}
          <button type="submit" disabled={signUpPending} className="min-h-12 w-full rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white shadow-sm shadow-orange-900/20 transition hover:bg-orange-700 disabled:opacity-50">
            {signUpPending ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      )}

      <div className="my-7 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">or</span>
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <button type="button" onClick={signInWithGoogle} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-bold text-zinc-800 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
          <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.826.957 4.039l3.007-2.332z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
        </svg>
        Continue with Google
      </button>
    </div>
  )
}
