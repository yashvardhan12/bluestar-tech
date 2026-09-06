/**
 * The duty windows a booking implies.
 *
 * Split from `createBooking.ts` so it stays free of the Supabase client and can
 * be checked by `dutyWindows.check.ts` — same reason `allowances.ts` is separate
 * from `dutyAllowances.ts`.
 *
 * This is the rule an importer is most likely to bypass: insert into `bookings`
 * alone and you get a booking that lists fine and is empty on the Duties page.
 */

import { localDate, toISODate } from './dutyTime.ts'

export interface DutyWindow {
  start_date: string
  end_date: string
  /** Import path only: real per-day times, which can differ from the booking's. */
  reporting_time?: string | null
  est_drop_time?: string | null
}

/**
 * Airport and Outstation run as a single duty across the whole window; Hourly
 * and Monthly get one duty per day.
 *
 * An empty result means the dates were unusable. The caller decides whether that
 * is an error — the form and the import disagree about it.
 */
export function generateDutyRows(
  category: string,
  startDate: string,
  endDate: string,
): DutyWindow[] {
  if (!startDate || !endDate || endDate < startDate) return []

  if (category === 'Airport' || category === 'Outstation') {
    return [{ start_date: startDate, end_date: endDate }]
  }

  const rows: DutyWindow[] = []
  const cur = localDate(startDate)
  const end = localDate(endDate)
  while (cur <= end) {
    const d = toISODate(cur)
    rows.push({ start_date: d, end_date: d })
    cur.setDate(cur.getDate() + 1)
  }
  return rows
}
