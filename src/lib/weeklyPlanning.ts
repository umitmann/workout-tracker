import { dateNDaysAfter, dateNDaysBefore } from './localDate'
import { isCalendarDate } from './personalTrainerAccess'

export type WeeklyPlanAvailability = 'upcoming' | 'available' | 'missed'

/** Returns the Monday containing an ISO-shaped local calendar date. */
export function startOfLocalWeek(date: string): string {
  if (!isCalendarDate(date)) throw new Error('Invalid calendar date')
  const localMidnight = new Date(`${date}T00:00:00`)
  const daysSinceMonday = (localMidnight.getDay() + 6) % 7
  return dateNDaysBefore(date, daysSinceMonday)
}

export function isMonday(date: string): boolean {
  return isCalendarDate(date) && startOfLocalWeek(date) === date
}

export function endOfLocalWeek(weekStart: string): string {
  if (!isMonday(weekStart)) throw new Error('Week must start on Monday')
  return dateNDaysAfter(weekStart, 6)
}

export function weeklyPlanAvailability(
  plan: { week_start: string | null; week_end: string | null },
  today: string,
): WeeklyPlanAvailability | null {
  if (!plan.week_start || !plan.week_end || !isCalendarDate(today)) return null
  if (today < plan.week_start) return 'upcoming'
  if (today > plan.week_end) return 'missed'
  return 'available'
}
