/**
 * Loading a `bookings` row into the Add/Edit Booking form.
 *
 * `copy: true` is the "duplicate this booking" path, and it is not the edit path
 * with a different button on it. Three values must not come across, and each one
 * breaks something different if it does:
 *
 *   booking_ref    set_booking_ref() assigns BK-##### only when the insert sends
 *                  an empty string. A copied ref writes a duplicate BK number —
 *                  the same class of bug as the client-side ref generator 032
 *                  removed.
 *   start_date /   the one value that is always wrong on a repeat booking, and
 *   end_date       wrong invisibly: createBooking() fans the duties out onto the
 *                  original's dates and the list still looks fine.
 *
 * Status never appears here — it is derived (bookingStatus.ts), not a form field.
 * Allotment cannot leak either: vehicle_id / driver_id live on `duties`, not on
 * `bookings`, so a copied booking has no allotment to carry.
 *
 * Everything else is the point of the copy. Rates in particular are carried
 * deliberately: they are what the operator most wants kept and most needs to
 * check, and a stale rate sitting visible in the form gets corrected, while a
 * blank one gets re-typed from memory.
 */

export interface BookingFormValues {
  bookingRef: string
  customer: string
  bookedByName: string
  bookedByPhone: string
  bookedByEmail: string
  passengers: { name: string; phone: string }[]
  dutyType: string
  vehicleGroup: string
  altVehicles: boolean
  fromLocation: string
  toLocation: string
  reportingAddress: string
  dropAddress: string
  bookingType: 'local' | 'outstation'
  isAirport: boolean
  startDate: string
  endDate: string
  reportingTime: string
  estDropTime: string
  garageStart: string
  baseRate: string
  extraKmRate: string
  extraHourRate: string
  billTo: string
  operatorNotes: string
  driverNotes: string
  sendConfirmation: boolean
}

/** The select every caller of bookingToForm() must use. */
export const BOOKING_FORM_SELECT = '*, booking_passengers(name, phone, sort_order)'

/**
 * A `bookings` row as PostgREST returns it. The columns stay `unknown` on
 * purpose — the client is `createClient<any>`, so a declared column type here
 * would be a claim nothing checks. str() copes with whatever actually arrives.
 */
export interface BookingRow {
  [column: string]: unknown
  booking_passengers?: { name?: string | null; phone?: string | null; sort_order?: number | null }[] | null
}

const str = (v: unknown): string => (v == null ? '' : String(v))

export function bookingToForm(row: BookingRow, opts: { copy?: boolean } = {}): BookingFormValues {
  const copy = opts.copy === true

  const passengers = [...(row.booking_passengers ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(p => ({ name: str(p.name), phone: str(p.phone) }))

  return {
    // ── withheld on copy ──
    bookingRef: copy ? '' : str(row.booking_ref),
    startDate:  copy ? '' : str(row.start_date),
    endDate:    copy ? '' : str(row.end_date),

    // ── carried ──
    customer:          str(row.customer_name),
    bookedByName:      str(row.booked_by_name),
    bookedByPhone:     str(row.booked_by_phone),
    bookedByEmail:     str(row.booked_by_email),
    // The form always renders at least one passenger row.
    passengers:        passengers.length > 0 ? passengers : [{ name: '', phone: '' }],
    dutyType:          str(row.duty_type),
    vehicleGroup:      str(row.vehicle_group),
    altVehicles:       row.assign_alternate_vehicles === true,
    fromLocation:      str(row.from_location),
    toLocation:        str(row.to_location),
    reportingAddress:  str(row.reporting_address),
    dropAddress:       str(row.drop_address),
    bookingType:       row.booking_type === 'outstation' ? 'outstation' : 'local',
    isAirport:         row.is_airport_booking === true,
    reportingTime:     str(row.reporting_time),
    estDropTime:       str(row.est_drop_time),
    garageStart:       str(row.garage_start_mins),
    baseRate:          str(row.base_rate),
    extraKmRate:       str(row.extra_km_rate),
    extraHourRate:     str(row.extra_hour_rate),
    billTo:            str(row.bill_to),
    operatorNotes:     str(row.operator_notes),
    driverNotes:       str(row.driver_notes),
    sendConfirmation:  row.send_confirmation === true,
  }
}
