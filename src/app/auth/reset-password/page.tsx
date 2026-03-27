'use client'

import { useActionState } from 'react'
import { updatePassword } from '@/app/actions/auth'

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(updatePassword, null)

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm px-4">
        <h1 className="text-2xl font-bold uppercase tracking-wide text-zinc-900 dark:text-white">
          New Password
        </h1>

        <form action={formAction} className="flex flex-col gap-3 w-full">
          <input
            name="password"
            type="password"
            placeholder="New password (min. 6 characters)"
            required
            minLength={6}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          {state?.error && (
            <p className="text-xs text-red-500">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
