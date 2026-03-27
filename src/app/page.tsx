'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function SignInContent() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Workout Tracker</h1>
      {error === 'registration_disabled' && (
        <p className="text-sm text-red-500">Registration is currently closed.</p>
      )}
      <button
        onClick={signInWithGoogle}
        className="flex items-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-medium text-zinc-800 shadow-md hover:shadow-lg transition-shadow border border-zinc-200"
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
