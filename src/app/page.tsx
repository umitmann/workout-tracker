'use client'

import { Suspense, useState, useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { signUpWithEmail, signInWithEmail } from '@/app/actions/auth'

const inputClass =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500'

function SignInContent() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')
  const [tab, setTab] = useState<'signin' | 'register'>('signin')

  const [signInState, signInAction, signInPending] = useActionState(signInWithEmail, null)
  const [signUpState, signUpAction, signUpPending] = useActionState(signUpWithEmail, null)

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm px-4">
      <h1 className="text-3xl font-bold uppercase tracking-wide text-zinc-900 dark:text-white">
        Workout Tracker
      </h1>

      {urlError === 'registration_disabled' && (
        <p className="text-sm text-red-500">Registration is currently closed.</p>
      )}
      {urlError === 'invalid_link' && (
        <p className="text-sm text-red-500">That link is invalid or has expired.</p>
      )}

      {/* Tab toggle */}
      <div className="flex w-full border-b border-zinc-200 dark:border-zinc-700">
        <button
          onClick={() => setTab('signin')}
          className={`flex-1 py-2 text-sm font-bold uppercase tracking-wide transition-colors ${
            tab === 'signin'
              ? 'border-b-2 border-orange-500 text-orange-500'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          Sign In
        </button>
        <button
          onClick={() => setTab('register')}
          className={`flex-1 py-2 text-sm font-bold uppercase tracking-wide transition-colors ${
            tab === 'register'
              ? 'border-b-2 border-orange-500 text-orange-500'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          Register
        </button>
      </div>

      {tab === 'signin' && (
        <form action={signInAction} className="flex flex-col gap-3 w-full">
          <input name="email" type="email" placeholder="Email" required className={inputClass} />
          <input name="password" type="password" placeholder="Password" required className={inputClass} />
          {signInState?.error && (
            <p className="text-xs text-red-500">{signInState.error}</p>
          )}
          <button
            type="submit"
            disabled={signInPending}
            className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {signInPending ? 'Signing in…' : 'Sign In'}
          </button>
          <a
            href="/forgot-password"
            className="text-center text-xs text-zinc-500 hover:text-orange-500 transition-colors"
          >
            Forgot password?
          </a>
        </form>
      )}

      {tab === 'register' && (
        <form action={signUpAction} className="flex flex-col gap-3 w-full">
          <input name="email" type="email" placeholder="Email" required className={inputClass} />
          <input
            name="password"
            type="password"
            placeholder="Password (min. 6 characters)"
            required
            minLength={6}
            className={inputClass}
          />
          {signUpState?.error && (
            <p className="text-xs text-red-500">{signUpState.error}</p>
          )}
          {signUpState?.message && (
            <p className="text-xs text-green-600">{signUpState.message}</p>
          )}
          <button
            type="submit"
            disabled={signUpPending}
            className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {signUpPending ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
      )}

      <div className="flex items-center gap-3 w-full">
        <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
        <span className="text-xs text-zinc-400 uppercase tracking-wide">or</span>
        <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
      </div>

      <button
        onClick={signInWithGoogle}
        className="flex items-center justify-center gap-3 w-full rounded-full bg-white px-6 py-3 text-sm font-medium text-zinc-800 shadow-md hover:shadow-lg transition-shadow border border-zinc-200"
      >
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
          <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.826.957 4.039l3.007-2.332z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
        </svg>
        Sign in with Google
      </button>
    </div>
  )
}

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <Suspense>
        <SignInContent />
      </Suspense>
    </div>
  )
}
