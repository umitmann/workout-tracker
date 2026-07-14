'use client'

import { useActionState } from 'react'
import { saveAccountProfileAction } from '@/app/actions/account'
import type { AccountProfile } from '@/lib/accountTypes'

const inputClass = 'min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white'

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null
  return <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">{messages.join(' ')}</p>
}

export default function AccountProfileForm({
  profile,
  email,
  timeZones,
}: {
  profile: AccountProfile
  email: string
  timeZones: string[]
}) {
  const [state, action, pending] = useActionState(saveAccountProfileAction, null)

  return (
    <form action={action} className="mt-6 space-y-5">
      <div>
        <label htmlFor="account-email" className="text-sm font-bold text-zinc-900 dark:text-white">Email</label>
        <input id="account-email" type="email" value={email} readOnly className={`${inputClass} mt-2 cursor-not-allowed bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400`} />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Your sign-in email is managed by the authentication provider.</p>
      </div>

      <div>
        <label htmlFor="account-display-name" className="text-sm font-bold text-zinc-900 dark:text-white">Display name</label>
        <input
          id="account-display-name"
          name="displayName"
          autoComplete="name"
          required
          minLength={1}
          maxLength={80}
          defaultValue={profile.display_name}
          aria-invalid={Boolean(state?.fieldErrors?.displayName)}
          className={`${inputClass} mt-2`}
        />
        <FieldError messages={state?.fieldErrors?.displayName} />
      </div>

      <div>
        <label htmlFor="account-avatar" className="text-sm font-bold text-zinc-900 dark:text-white">Avatar URL</label>
        <input
          id="account-avatar"
          name="avatarUrl"
          type="url"
          inputMode="url"
          autoComplete="photo"
          maxLength={2048}
          placeholder="https://…"
          defaultValue={profile.avatar_url ?? ''}
          aria-invalid={Boolean(state?.fieldErrors?.avatarUrl)}
          className={`${inputClass} mt-2`}
        />
        <FieldError messages={state?.fieldErrors?.avatarUrl} />
      </div>

      <div>
        <label htmlFor="account-time-zone" className="text-sm font-bold text-zinc-900 dark:text-white">Time zone</label>
        <select id="account-time-zone" name="timeZone" defaultValue={profile.time_zone} className={`${inputClass} mt-2`}>
          {timeZones.map((timeZone) => <option key={timeZone} value={timeZone}>{timeZone.replaceAll('_', ' ')}</option>)}
        </select>
        <FieldError messages={state?.fieldErrors?.timeZone} />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Your preferred time zone for scheduling context.</p>
      </div>

      {state && (
        <p role={state.success ? 'status' : 'alert'} className={`rounded-xl p-3 text-sm font-medium ${state.success ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'}`}>
          {state.message}
        </p>
      )}

      <button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-orange-600 px-5 text-sm font-black text-white transition hover:bg-orange-700 disabled:cursor-wait disabled:opacity-60">
        {pending ? 'Saving…' : 'Save account settings'}
      </button>
    </form>
  )
}
