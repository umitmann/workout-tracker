import type { NextRequest } from 'next/server'
import { getMonthWorkoutsWithPreviews } from '@/lib/dal'
import { parseCalendarQuery } from '@/lib/calendarQuery'
import { getServerAuthContext } from '@/lib/serverAuth'

const privateHeaders = {
  'Cache-Control': 'private, no-store',
}

export async function GET(request: NextRequest) {
  const { user } = await getServerAuthContext()
  if (!user) {
    return Response.json({ error: 'Authentication required.' }, {
      status: 401,
      headers: privateHeaders,
    })
  }

  const query = parseCalendarQuery(request.nextUrl.searchParams)
  if (!query.success) {
    return Response.json({ error: 'Choose a valid calendar month.' }, {
      status: 400,
      headers: privateHeaders,
    })
  }

  try {
    const data = await getMonthWorkoutsWithPreviews(query.year, query.month)
    return Response.json(data, { headers: privateHeaders })
  } catch {
    return Response.json({ error: 'The calendar could not be loaded.' }, {
      status: 500,
      headers: privateHeaders,
    })
  }
}
