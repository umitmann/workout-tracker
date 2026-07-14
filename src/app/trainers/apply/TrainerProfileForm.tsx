'use client'

import { useActionState } from 'react'
import { saveTrainerProfileAction } from '@/app/actions/trainers'
import type { OwnTrainerProfile, TrainerFieldErrors } from '@/lib/trainerTypes'

const inputClass =
  'w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white'

function FieldErrors({ errors }: { errors: string[] | undefined }) {
  if (!errors?.length) return null
  return (
    <ul className="text-xs text-red-600 dark:text-red-400">
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  )
}

function statusCopy(profile: OwnTrainerProfile | null) {
  if (!profile) return 'No application submitted yet.'
  switch (profile.verification_status) {
    case 'approved':
      return profile.listing_status === 'published'
        ? 'Approved and visible in the trainer directory.'
        : 'Approved. Set the listing to ready to publish when you want it visible.'
    case 'rejected':
      return 'Not approved. Saving changes resubmits the profile for review.'
    case 'suspended':
      return 'Suspended by an administrator. Saving changes cannot reactivate the listing.'
    default:
      return 'Awaiting administrator review. Only you and platform administrators can see it.'
  }
}

export default function TrainerProfileForm({
  profile,
  defaultDisplayName,
}: {
  profile: OwnTrainerProfile | null
  defaultDisplayName: string
}) {
  const [state, action, pending] = useActionState(saveTrainerProfileAction, null)
  const errors: TrainerFieldErrors = state?.fieldErrors ?? {}

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Review status</p>
        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{statusCopy(profile)}</p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Public display name
        <input
          name="displayName"
          required
          minLength={1}
          maxLength={80}
          defaultValue={profile?.display_name ?? defaultDisplayName}
          autoComplete="name"
          className={inputClass}
          aria-invalid={Boolean(errors.displayName?.length)}
        />
        <FieldErrors errors={errors.displayName} />
      </label>

      <div className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        <label htmlFor="trainer-bio">Public bio</label>
        <textarea
          id="trainer-bio"
          name="bio"
          maxLength={2000}
          rows={7}
          defaultValue={profile?.bio ?? ''}
          className={inputClass}
          aria-invalid={Boolean(errors.bio?.length)}
          aria-describedby="trainer-bio-hint"
        />
        <span id="trainer-bio-hint" className="text-xs font-normal text-zinc-500">Up to 2,000 characters. Do not add private contact details.</span>
        <FieldErrors errors={errors.bio} />
      </div>

      <div className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        <label htmlFor="trainer-specialties">Specialties</label>
        <input
          id="trainer-specialties"
          name="specialties"
          maxLength={1000}
          defaultValue={profile?.specialties.join(', ') ?? ''}
          placeholder="strength training, mobility, running"
          className={inputClass}
          aria-invalid={Boolean(errors.specialties?.length)}
          aria-describedby="trainer-specialties-hint"
        />
        <span id="trainer-specialties-hint" className="text-xs font-normal text-zinc-500">Separate up to 20 specialties with commas.</span>
        <FieldErrors errors={errors.specialties} />
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Location
        <input
          name="locationText"
          maxLength={120}
          defaultValue={profile?.location_text ?? ''}
          placeholder="Amsterdam, Netherlands"
          autoComplete="address-level2"
          className={inputClass}
          aria-invalid={Boolean(errors.locationText?.length)}
        />
        <FieldErrors errors={errors.locationText} />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Avatar URL (optional)
        <input
          name="avatarUrl"
          type="url"
          maxLength={2048}
          pattern="https://.*"
          defaultValue={profile?.avatar_url ?? ''}
          placeholder="https://example.com/photo.jpg"
          className={inputClass}
          aria-invalid={Boolean(errors.avatarUrl?.length)}
        />
        <FieldErrors errors={errors.avatarUrl} />
      </label>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <legend className="px-1 text-sm font-semibold text-zinc-900 dark:text-white">Availability</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            name="remoteAvailable"
            defaultChecked={profile?.remote_available ?? false}
            className="h-5 w-5 accent-orange-500"
          />
          Available for remote training
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            name="acceptingClients"
            defaultChecked={profile?.accepting_clients ?? false}
            className="h-5 w-5 accent-orange-500"
          />
          Currently accepting clients
        </label>
      </fieldset>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Directory state
        <select
          name="listingStatus"
          defaultValue={profile?.listing_status ?? 'draft'}
          className={inputClass}
          aria-invalid={Boolean(errors.listingStatus?.length)}
        >
          <option value="draft">Draft — keep private</option>
          <option value="published">Ready to publish after approval</option>
          <option value="paused">Paused — hide from directory</option>
        </select>
        <FieldErrors errors={errors.listingStatus} />
      </label>

      {state && (
        <p
          role="status"
          className={`rounded-xl p-4 text-sm ${
            state.success
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
          }`}
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Saving…' : profile ? 'Save trainer profile' : 'Create trainer profile'}
      </button>
    </form>
  )
}
