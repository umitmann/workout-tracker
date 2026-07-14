export type AccountProfileInput = {
  displayName: string
  avatarUrl: string | null
  timeZone: string
}

export type AccountProfileFieldErrors = Partial<
  Record<'displayName' | 'avatarUrl' | 'timeZone', string[]>
>

export type AccountProfileValidationResult =
  | { success: true; data: AccountProfileInput }
  | { success: false; fieldErrors: AccountProfileFieldErrors }

function text(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function validTimeZone(value: string): boolean {
  if (!value || value.length > 100) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function parseAccountProfileForm(formData: FormData): AccountProfileValidationResult {
  const fieldErrors: AccountProfileFieldErrors = {}
  const displayName = text(formData.get('displayName')).replace(/\s+/g, ' ')
  const rawAvatarUrl = text(formData.get('avatarUrl'))
  const timeZone = text(formData.get('timeZone'))

  if (displayName.length < 1 || displayName.length > 80) {
    fieldErrors.displayName = ['Use between 1 and 80 characters.']
  }

  if (rawAvatarUrl.length > 2048) {
    fieldErrors.avatarUrl = ['Use at most 2,048 characters.']
  } else if (rawAvatarUrl) {
    try {
      const url = new URL(rawAvatarUrl)
      if (url.protocol !== 'https:' || url.username || url.password) {
        fieldErrors.avatarUrl = ['Use a public HTTPS image URL.']
      }
    } catch {
      fieldErrors.avatarUrl = ['Enter a valid HTTPS image URL.']
    }
  }

  if (!validTimeZone(timeZone)) {
    fieldErrors.timeZone = ['Choose a valid time zone.']
  }

  if (Object.keys(fieldErrors).length > 0) return { success: false, fieldErrors }
  return {
    success: true,
    data: {
      displayName,
      avatarUrl: rawAvatarUrl || null,
      timeZone,
    },
  }
}
