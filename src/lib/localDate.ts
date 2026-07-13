// The only sanctioned way to turn a Date into a calendar-day string
// (ADR-0005). Splitting toISOString on its "T" separator is BANNED for
// calendar dates — it reads UTC fields, so a user west of UTC gets
// tomorrow's date for an evening workout. This reads local fields
// (getFullYear/getMonth/getDate), so the day the user experienced is the
// day that gets stored.
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Local-calendar-day arithmetic: "N days before `today`", where `today` is
// itself a YYYY-MM-DD local-date string (from localDateStr()). Parses as
// local midnight (not UTC midnight) so the subtraction stays anchored to the
// user's day even across DST transitions — used for every "last N days"
// window (§7.8 60-day best-session, exercise history, PT report ranges) so
// the boundary is *my* days, not the server's UTC clock (ADR-0005).
export function dateNDaysBefore(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00`)
  d.setDate(d.getDate() - days)
  return localDateStr(d)
}

/** Local-calendar-day addition for future schedules, preserving DST-safe day semantics. */
export function dateNDaysAfter(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00`)
  d.setDate(d.getDate() + days)
  return localDateStr(d)
}

export type CalendarDayClass = {
  isToday: boolean
  isPast: boolean
  isFuture: boolean
}

// Pure cell classification extracted from CalendarView — both `dateStr` and
// `today` must already be YYYY-MM-DD local-date strings (produced by
// localDateStr from the same clock) for this to be correct; this function
// itself does no Date construction, so it carries no TZ behaviour of its
// own — string comparison on zero-padded ISO-shaped dates sorts correctly.
export function classifyCalendarDay(dateStr: string, today: string): CalendarDayClass {
  const isFuture = dateStr > today
  const isPast = dateStr < today
  return { isToday: dateStr === today, isPast, isFuture }
}
