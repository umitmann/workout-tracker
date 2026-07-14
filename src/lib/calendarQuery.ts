export type CalendarQueryResult =
  | { success: true; year: number; month: number }
  | { success: false }

const MIN_CALENDAR_YEAR = 1900
const MAX_CALENDAR_YEAR = 2100

export function parseCalendarQuery(searchParams: URLSearchParams): CalendarQueryResult {
  const years = searchParams.getAll('year')
  const months = searchParams.getAll('month')
  if (years.length !== 1 || months.length !== 1) return { success: false }

  const [rawYear] = years
  const [rawMonth] = months
  if (!/^\d{4}$/.test(rawYear) || !/^\d{1,2}$/.test(rawMonth)) {
    return { success: false }
  }

  const year = Number(rawYear)
  const month = Number(rawMonth)
  if (
    !Number.isInteger(year)
    || year < MIN_CALENDAR_YEAR
    || year > MAX_CALENDAR_YEAR
    || !Number.isInteger(month)
    || month < 1
    || month > 12
  ) {
    return { success: false }
  }

  return { success: true, year, month }
}
