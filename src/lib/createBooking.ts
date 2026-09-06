/**
 * The one path that creates a booking.
 *
 * Creating a booking is three writes, not one: the `bookings` row, its
 * passengers, and its duties. The duty fan-out has rules — Airport and
 * Outstation get a single duty for the whole window, Hourly and Monthly get one
 * per day — and a caller that inserts into `bookings` alone produces a booking
 * that looks fine in the list and is empty on the Duties page.
 *
 * Extracted from AddBookingDrawer so the bulk import calls exactly this. The
 * import supplies its own duty rows (the client export already carries one row
 * per day of travel); the form omits them and lets `generateDutyRows` fan out.
 * Either way the rules live here once.
 */

import { supabase } from './supabase'
import { generateDutyRows, type DutyWindow } from './dutyWindows'

/** Duty columns copied down from the booking. Shared with the edit-time sync. */
export type DutyShared = Record<string, unknown>

export interface CreateBookingArgs {
  /** Empty string hands assignment to set_booking_ref(); the import passes a Travel ID. */
  bookingRef: string
  /** `bookings` columns. Never company_id (defaulted, immutable) and never status. */
  booking: Record<string, unknown>
  passengers: { name: string; phone: string }[]
  shared: DutyShared
  category: string
  startDate: string
  endDate: string
  /** Explicit duty windows. Omit to fan out from `category`. */
  duties?: DutyWindow[]
}

export interface CreateBookingResult {
  id: number | null
  /** Set when the booking itself could not be written — nothing was created. */
  error: string | null
  /** Set when the booking exists but a dependent write failed. See dutiesWritten. */
  partial: string | null
  dutiesWritten: number
}

/**
 * Writes a booking, its passengers and its duties.
 *
 * There is no transaction across the three, so a failure after the booking row
 * lands leaves it duty-less. That is reported as `partial` rather than swallowed,
 * because the re-run skip test ("booking exists AND has duties") is what repairs
 * it — and a caller that treats a partial as success will never trigger that.
 */
export async function createBooking(args: CreateBookingArgs): Promise<CreateBookingResult> {
  const fail = (error: string): CreateBookingResult =>
    ({ id: null, error, partial: null, dutiesWritten: 0 })

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .insert({ booking_ref: args.bookingRef.trim(), ...args.booking })
    .select('id')
    .single()

  if (bookingErr || !booking) {
    console.error('[createBooking] booking insert failed:', bookingErr?.message)
    return fail(bookingErr?.message ?? 'Booking insert returned no row.')
  }

  const id = booking.id as number
  let partial: string | null = null

  const validPassengers = args.passengers.filter(p => p.name || p.phone)
  if (validPassengers.length > 0) {
    const { error: passErr } = await supabase.from('booking_passengers').insert(
      validPassengers.map((p, i) => ({
        booking_id: id, name: p.name || null, phone: p.phone || null, sort_order: i,
      })),
    )
    if (passErr) {
      console.error('[createBooking] passengers insert failed:', passErr.message)
      partial = `Passengers not saved: ${passErr.message}`
    }
  }

  const windows = args.duties ?? generateDutyRows(args.category, args.startDate, args.endDate)
  if (windows.length === 0) {
    return { id, error: null, partial: partial ?? 'No duties were created for this booking.', dutiesWritten: 0 }
  }

  const { error: dutiesErr } = await supabase.from('duties').insert(
    windows.map(w => ({
      booking_id: id,
      ...args.shared,
      // A per-day time from the import overrides the booking-level one.
      ...(w.reporting_time !== undefined ? { reporting_time: w.reporting_time } : {}),
      ...(w.est_drop_time !== undefined ? { est_drop_time: w.est_drop_time } : {}),
      start_date: w.start_date,
      end_date: w.end_date,
    })),
  )

  if (dutiesErr) {
    console.error('[createBooking] duties insert failed:', dutiesErr.message)
    return { id, error: null, partial: `Duties not created: ${dutiesErr.message}`, dutiesWritten: 0 }
  }

  return { id, error: null, partial, dutiesWritten: windows.length }
}
