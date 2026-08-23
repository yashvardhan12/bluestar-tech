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
 *
 * Nothing here auto-completes a duty. `syncCompletedDuties` used to flip any
 * On-Going duty whose end_date had passed straight to Completed — on the date
 * alone, with no closed_at, no odometer pair and no signature — which is how
 * duty 3 ended up Completed having never been started. FR-54 forbids it and
 * FR-59 replaces it with an operator action; both it and the two On-Going batch
 * helpers were dead once duties_status/bookings_status derived those statuses in
 * SQL, and are gone.
 */

import { supabase } from './supabase'
import { atTime } from './dutyTime'
import type { BookingStatus } from '../components/ui/StatusBadge'

const PROTECTED: BookingStatus[] = ['Billed', 'Cancelled']

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
    (min, d) => { const dt = atTime(d.start_date, d.reporting_time); return dt < min ? dt : min },
    atTime(active[0].start_date, active[0].reporting_time),
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
  const start = atTime(startDate, reportingTime)
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

