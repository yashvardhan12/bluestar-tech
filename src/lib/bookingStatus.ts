/**
 * Booking status automation
 *
 * Automatic transition rules (in priority order):
 *  Completed        – all non-cancelled duties are Completed or Billed
 *  On-Going         – at least one duty has a vehicle assigned AND current time is within the booking window
 *  Allotted         – all non-cancelled duties have a vehicle assigned
 *  Partially Allotted – some (but not all) non-cancelled duties have a vehicle
 *  Confirmed        – allotment was cleared; revert from Allotted/Partially Allotted back to Confirmed
 *
 * Protected statuses that are never touched by automation:
 *  Billed, Cancelled
 */

import { supabase } from './supabase'
import type { BookingStatus } from '../components/ui/StatusBadge'

const PROTECTED: BookingStatus[] = ['Billed', 'Cancelled']

/** Parse an ISO date + HH:MM time string into a Date, safely. */
function toDatetime(isoDate: string, time: string | null): Date {
  const t = time ?? '00:00'
  // reporting_time from Postgres comes as "HH:MM:SS" or "HH:MM"
  const [hh, mm] = t.split(':')
  const d = new Date(isoDate)
  d.setHours(Number(hh), Number(mm), 0, 0)
  return d
}

/**
 * Recomputes and persists the correct status for one booking.
 * Returns the new status if it changed, null otherwise.
 */
export async function syncBookingStatus(bookingId: number): Promise<BookingStatus | null> {
  // 1. Fetch current booking status
  const { data: booking } = await supabase
    .from('bookings')
    .select('status')
    .eq('id', bookingId)
    .single()

  if (!booking) return null
  if (PROTECTED.includes(booking.status as BookingStatus)) return null

  // 2. Fetch all duties for this booking
  const { data: duties } = await supabase
    .from('duties')
    .select('vehicle_id, start_date, end_date, reporting_time, status')
    .eq('booking_id', bookingId)

  // No duties → nothing to infer
  if (!duties || duties.length === 0) return null

  // Only non-cancelled duties count toward allotment / timeline checks
  const active = duties.filter(d => d.status !== 'Cancelled')
  if (active.length === 0) return null

  const now = new Date()

  // ── Priority 1: Completed ───────────────────────────────────────────────────
  const allDone = active.every(d => d.status === 'Completed' || d.status === 'Billed')
  if (allDone) return apply(bookingId, 'Completed', booking.status)

  // ── Priority 2: On-Going ───────────────────────────────────────────────────
  const firstStart = active.reduce<Date>(
    (min, d) => { const dt = toDatetime(d.start_date, d.reporting_time); return dt < min ? dt : min },
    toDatetime(active[0].start_date, active[0].reporting_time),
  )
  const lastEnd = active.reduce<Date>(
    (max, d) => { const dt = new Date(d.end_date + 'T23:59:59'); return dt > max ? dt : max },
    new Date(active[0].end_date + 'T23:59:59'),
  )

  // ── Priority 2: On-Going (requires at least one allotted duty within the window) ──
  const allottedCount = active.filter(d => d.vehicle_id != null).length
  if (allottedCount > 0 && now >= firstStart && now <= lastEnd) return apply(bookingId, 'On-Going', booking.status)

  // ── Priority 3: Allotted / Partially Allotted ──────────────────────────────

  if (allottedCount === active.length) return apply(bookingId, 'Allotted', booking.status)
  if (allottedCount > 0)              return apply(bookingId, 'Partially Allotted', booking.status)

  // ── Priority 4: Revert to Confirmed when allotment is cleared ──────────────
  // (only if it was previously in an allotted state)
  const wasAllotted: BookingStatus[] = ['Allotted', 'Partially Allotted']
  if (wasAllotted.includes(booking.status as BookingStatus)) {
    return apply(bookingId, 'Confirmed', booking.status)
  }

  return null
}

async function apply(
  bookingId: number,
  newStatus: BookingStatus,
  currentStatus: string,
): Promise<BookingStatus | null> {
  if (newStatus === currentStatus) return null
  await supabase.from('bookings').update({ status: newStatus }).eq('id', bookingId)
  return newStatus
}

/**
 * Batch On-Going check for multiple bookings that are already in
 * Allotted or Partially Allotted state.
 *
 * Fires one duties query (not N), evaluates client-side, then bulk-updates.
 * Returns the IDs of bookings that were flipped to On-Going.
 */
export async function syncOnGoingStatuses(bookingIds: number[]): Promise<number[]> {
  if (bookingIds.length === 0) return []

  const { data: duties } = await supabase
    .from('duties')
    .select('booking_id, vehicle_id, start_date, end_date, reporting_time, status')
    .in('booking_id', bookingIds)
    .neq('status', 'Cancelled')

  if (!duties || duties.length === 0) return []

  // Group by booking
  const grouped = new Map<number, typeof duties>()
  for (const d of duties) {
    const list = grouped.get(d.booking_id) ?? []
    list.push(d)
    grouped.set(d.booking_id, list)
  }

  const now = new Date()
  const toFlip: number[] = []

  for (const [id, rows] of grouped) {
    const firstStart = rows.reduce<Date>(
      (min, d) => { const dt = toDatetime(d.start_date, d.reporting_time); return dt < min ? dt : min },
      toDatetime(rows[0].start_date, rows[0].reporting_time),
    )
    const lastEnd = rows.reduce<Date>(
      (max, d) => { const dt = new Date(d.end_date + 'T23:59:59'); return dt > max ? dt : max },
      new Date(rows[0].end_date + 'T23:59:59'),
    )

    const hasAllotted = rows.some(d => d.vehicle_id != null)
    if (hasAllotted && now >= firstStart && now <= lastEnd) toFlip.push(id)
  }

  if (toFlip.length > 0) {
    await supabase.from('bookings').update({ status: 'On-Going' }).in('id', toFlip)
  }

  return toFlip
}

// ── Duty status automation ────────────────────────────────────────────────────

export type DutyStatus = 'Booked' | 'Confirmed' | 'Allotted' | 'On-Going' | 'Completed' | 'Cancelled'

const DUTY_PROTECTED: DutyStatus[] = ['Completed', 'Cancelled']

/**
 * Compute the correct status for a duty from its raw fields (no DB call).
 * Rules (in priority order):
 *  On-Going  – vehicle assigned AND current time is within the duty window
 *  Allotted  – vehicle assigned, outside the duty window
 *  Booked    – no vehicle assigned
 */
export function computeDutyStatus(
  vehicleId: number | null | undefined,
  startDate: string,
  endDate: string,
  reportingTime: string | null,
): DutyStatus {
  const now   = new Date()
  const start = toDatetime(startDate, reportingTime)
  const end   = new Date(endDate + 'T23:59:59')
  if (vehicleId != null && now >= start && now <= end) return 'On-Going'
  return vehicleId != null ? 'Allotted' : 'Booked'
}

/**
 * Recomputes and persists the correct status for a single duty.
 * Returns the new status if it changed, null otherwise.
 */
export async function syncDutyStatus(dutyId: number): Promise<DutyStatus | null> {
  const { data: duty } = await supabase
    .from('duties')
    .select('status, vehicle_id, start_date, end_date, reporting_time')
    .eq('id', dutyId)
    .single()

  if (!duty) return null
  if (DUTY_PROTECTED.includes(duty.status as DutyStatus)) return null

  const newStatus = computeDutyStatus(duty.vehicle_id, duty.start_date, duty.end_date, duty.reporting_time)
  if (newStatus === duty.status) return null

  await supabase.from('duties').update({ status: newStatus }).eq('id', dutyId)
  return newStatus
}

/**
 * Batch On-Going check for multiple duties.
 * Fires one query, evaluates client-side, then bulk-updates.
 * Returns the IDs of duties that were flipped to On-Going.
 */
export async function syncDutiesOnGoing(dutyIds: number[]): Promise<number[]> {
  if (dutyIds.length === 0) return []

  const { data: duties } = await supabase
    .from('duties')
    .select('id, vehicle_id, start_date, end_date, reporting_time, status')
    .in('id', dutyIds)

  if (!duties || duties.length === 0) return []

  const now = new Date()
  const toFlip: number[] = []

  for (const d of duties) {
    if (DUTY_PROTECTED.includes(d.status as DutyStatus)) continue
    const start = toDatetime(d.start_date, d.reporting_time)
    const end   = new Date(d.end_date + 'T23:59:59')
    if (d.vehicle_id != null && now >= start && now <= end && d.status !== 'On-Going') toFlip.push(d.id)
  }

  if (toFlip.length > 0) {
    await supabase.from('duties').update({ status: 'On-Going' }).in('id', toFlip)
  }

  return toFlip
}

/**
 * Auto-complete: find all On-Going duties whose end_date has passed and
 * mark them Completed, then sync their booking statuses.
 * Returns the IDs of duties that were flipped.
 */
export async function syncCompletedDuties(): Promise<number[]> {
  const today = new Date().toISOString().split('T')[0]

  const { data: duties } = await supabase
    .from('duties')
    .select('id, booking_id')
    .eq('status', 'On-Going')
    .lt('end_date', today)

  if (!duties || duties.length === 0) return []

  const ids = duties.map((d: any) => d.id)
  await supabase.from('duties').update({ status: 'Completed' }).in('id', ids)

  const bookingIds = [...new Set(duties.map((d: any) => d.booking_id as number))]
  await Promise.all(bookingIds.map(id => syncBookingStatus(id)))

  return ids
}
