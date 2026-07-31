import { isCalendarDate } from './personalTrainerAccess'

export type DailyReadiness = {
  checkin_date: string
  feeling: 1 | 2 | 3 | 4 | 5
}

export const READINESS_OPTIONS = [
  { value: 1, emoji: '😣', label: 'Struggling' },
  { value: 2, emoji: '😕', label: 'Low' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' },
] as const

export function isReadinessValue(value: unknown): value is DailyReadiness['feeling'] {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5
}

export function normalizeReadiness(value: unknown): DailyReadiness | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const date = typeof row.checkin_date === 'string' ? row.checkin_date : ''
  const feeling = typeof row.feeling === 'number' ? row.feeling : Number(row.feeling)
  return isCalendarDate(date) && isReadinessValue(feeling)
    ? { checkin_date: date, feeling }
    : null
}
