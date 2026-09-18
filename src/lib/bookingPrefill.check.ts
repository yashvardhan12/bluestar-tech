// node --experimental-strip-types src/lib/bookingPrefill.check.ts
import assert from 'node:assert/strict'
import { bookingToForm } from './bookingPrefill.ts'

const row = {
  booking_ref: 'BK-00421',
  start_date: '2026-08-12',
  end_date: '2026-08-12',
  customer_name: 'Acme Corp',
  booked_by_name: 'R. Iyer',
  booked_by_phone: '9876543210',
  booked_by_email: 'travel@acme.example',
  duty_type: 'Airport Drop',
  vehicle_group: 'Innova',
  assign_alternate_vehicles: true,
  from_location: 'Andheri',
  to_location: 'T2',
  reporting_address: 'Acme House, Andheri East',
  drop_address: 'Terminal 2 Departures',
  booking_type: 'local',
  is_airport_booking: true,
  reporting_time: '06:30',
  est_drop_time: '08:00',
  garage_start_mins: 45,
  base_rate: 2400,
  extra_km_rate: 18,
  extra_hour_rate: 200,
  bill_to: 'Acme Corp',
  operator_notes: 'gate pass needed',
  driver_notes: 'call on arrival',
  send_confirmation: true,
  booking_passengers: [
    { name: 'Sharma', phone: '9000000002', sort_order: 1 },
    { name: 'Mehta', phone: '9000000001', sort_order: 0 },
  ],
}

// ── edit path carries everything, including identity ──────────────────────────
const edit = bookingToForm(row)
assert.equal(edit.bookingRef, 'BK-00421')
assert.equal(edit.startDate, '2026-08-12')
assert.equal(edit.endDate, '2026-08-12')

// ── copy path withholds exactly ref + dates ───────────────────────────────────
const copy = bookingToForm(row, { copy: true })
assert.equal(copy.bookingRef, '', 'a copied ref would make set_booking_ref() skip assignment')
assert.equal(copy.startDate, '', 'a copied start date silently fans duties onto the original days')
assert.equal(copy.endDate, '')

// Nothing else may differ between the two paths. This is the regression guard:
// a field added to the form shows up here the moment it is treated differently.
const withheld = new Set(['bookingRef', 'startDate', 'endDate'])
for (const k of Object.keys(edit) as (keyof typeof edit)[]) {
  if (withheld.has(k as string)) continue
  assert.deepEqual(copy[k], edit[k], `${k} must survive a copy`)
}

// ── the values the copy exists for ────────────────────────────────────────────
assert.equal(copy.customer, 'Acme Corp')
assert.equal(copy.dutyType, 'Airport Drop')
assert.equal(copy.reportingTime, '06:30', 'the time is the pattern, not the instance')
assert.equal(copy.estDropTime, '08:00')
assert.equal(copy.baseRate, '2400', 'rates carry, and stay visible for checking')
assert.equal(copy.extraKmRate, '18')
assert.equal(copy.extraHourRate, '200')
assert.equal(copy.garageStart, '45')
assert.equal(copy.altVehicles, true)
assert.equal(copy.isAirport, true)

// ── passengers come back in sort_order, not query order ───────────────────────
assert.deepEqual(copy.passengers, [
  { name: 'Mehta', phone: '9000000001' },
  { name: 'Sharma', phone: '9000000002' },
])

// ── a booking with no passengers still renders one blank row ──────────────────
assert.deepEqual(
  bookingToForm({ ...row, booking_passengers: [] }, { copy: true }).passengers,
  [{ name: '', phone: '' }],
)
assert.deepEqual(
  bookingToForm({ ...row, booking_passengers: null }).passengers,
  [{ name: '', phone: '' }],
)

// ── nulls become '' and never the string "null" ───────────────────────────────
const sparse = bookingToForm({ customer_name: 'X', base_rate: null, duty_type: undefined })
assert.equal(sparse.baseRate, '')
assert.equal(sparse.dutyType, '')
assert.equal(sparse.bookingType, 'local', 'default when booking_type is absent')
assert.equal(sparse.sendConfirmation, false)
assert.equal(sparse.altVehicles, false)

// ── a zero rate is a real value, not an empty one ─────────────────────────────
assert.equal(bookingToForm({ base_rate: 0 }, { copy: true }).baseRate, '0')

console.log('bookingPrefill.check.ts OK')
