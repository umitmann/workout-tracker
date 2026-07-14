import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { parseCalendarQuery } from '../src/lib/calendarQuery.ts'

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('calendar query accepts one bounded integer year and month', () => {
  assert.deepEqual(
    parseCalendarQuery(new URLSearchParams({ year: '2026', month: '7' })),
    { success: true, year: 2026, month: 7 },
  )

  for (const params of [
    {},
    { year: '2026', month: '0' },
    { year: '2026', month: '13' },
    { year: '2026.5', month: '7' },
    { year: '1899', month: '7' },
    { year: '2101', month: '7' },
    { year: '2026', month: '7', extra: 'ignored' },
  ]) {
    const result = parseCalendarQuery(new URLSearchParams(params))
    if ('extra' in params) {
      assert.deepEqual(result, { success: true, year: 2026, month: 7 })
    } else {
      assert.deepEqual(result, { success: false })
    }
  }
})

test('speculative calendar reads use an authenticated GET route, not Server Actions', async () => {
  const [calendar, route, actions] = await Promise.all([
    source('../src/app/workouts/CalendarView.tsx'),
    source('../src/app/api/calendar/route.ts'),
    source('../src/app/actions/workouts.ts'),
  ])

  assert.doesNotMatch(calendar, /fetchMonthWorkoutsWithPreviews/)
  assert.match(calendar, /fetch\(`\/api\/calendar\?year=\$\{year\}&month=\$\{month\}`/)
  assert.match(calendar, /cache: 'no-store'/)
  assert.match(calendar, /AbortController/)
  assert.match(route, /getServerAuthContext\(\)/)
  assert.match(route, /status: 401/)
  assert.match(route, /parseCalendarQuery\(request\.nextUrl\.searchParams\)/)
  assert.match(route, /status: 400/)
  assert.match(route, /getMonthWorkoutsWithPreviews\(query\.year, query\.month\)/)
  assert.match(route, /'Cache-Control': 'private, no-store'/)
  assert.doesNotMatch(actions, /export async function fetchMonthWorkouts/)
})
