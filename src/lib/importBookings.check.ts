// node --experimental-strip-types src/lib/importBookings.check.ts
//
// Guards the three decisions that corrupt data silently rather than loudly:
// grouping on the wrong key, matching a customer on its name, and treating an
// already-imported booking as new.

import assert from 'node:assert/strict'
import {
  buildImportPlan, bookingPayload, dutyTypeKey, expectedDutyType, gstinOf,
  missingColumns, REQUIRED_COLUMNS, type ReferenceData, type SheetRow,
} from './importBookings.ts'

const row = (o: Partial<Record<string, string>>): SheetRow => ({
  'Trip ID': '7000253326', 'Travel ID': '60082453',
  'Trip Start Date': '16-01-2024', 'Trip End Date': '16-01-2024',
  'Daily Journey Start Date': '16-01-2024', 'Daily Journey Start Time': '11:00:00',
  'Daily Journey End Date': '16-01-2024', 'Daily Journey End Time': '23:00:00',
  'Daily Journey Time': '12',
  'Package Type': 'Intra City', 'Car Type': 'Sedan', 'Zone No': '1',
  'Source': 'Andheri', 'Destination': 'Bandra',
  'Company name': 'Reliance Industries Ltd', 'Company GSTIN': '27AAACR5055K1Z7',
  'Employee name': 'Mr. Rohit Bansal',
  ...o,
})

const ref: ReferenceData = {
  customers: ['M/s .Reliance Industries ltd (27AAACR5055K1Z7)', 'M/s .Darshan Services Pvt Ltd.'],
  dutyTypes: [
    { name: 'Hourly | Sedan', category: 'Hourly', vehicleGroup: 'Sedan' },
    { name: 'Airport Zone - 1 | Sedan', category: 'Airport', vehicleGroup: 'Sedan' },
  ],
  locations: ['Andheri', 'Bandra', 'International Airport'],
  existingDuties: {},
}

// ── header validation ───────────────────────────────────────────────────────
assert.deepEqual(missingColumns(REQUIRED_COLUMNS), [])
assert.deepEqual(missingColumns(REQUIRED_COLUMNS.filter(c => c !== 'Travel ID')), ['Travel ID'])

// ── customer key is the GSTIN inside the name, not the company name ─────────
assert.equal(gstinOf('M/s.Reliance Industries Ltd (27AAACR5055K3Z5)'), '27AAACR5055K3Z5')
assert.equal(gstinOf('M/s .Darshan Services Pvt Ltd.'), null)

// ── duty type naming, and the hyphen inconsistency that is live in the table ─
assert.equal(expectedDutyType('Intra City', 'Sedan', '1'), 'Hourly | Sedan')
assert.equal(expectedDutyType('Airport Pick Up', 'Sedan', '2'), 'Airport Zone 2 | Sedan')
assert.equal(expectedDutyType('Outstation', 'Suv', '3'), 'Outdoor | Suv')
assert.equal(expectedDutyType('Monthly', 'Premium Suv', '1'), 'Monthly | Premium Suv')
assert.equal(dutyTypeKey('Airport Zone - 1 | Sedan'), dutyTypeKey('Airport Zone 1 | Sedan'))

// ── grouping is on Travel ID, never Trip ID ─────────────────────────────────
// One Trip ID holding two bookings is the real case that made this the rule.
{
  const plan = buildImportPlan([
    row({ 'Trip ID': '7000302811', 'Travel ID': '60122872', 'Trip Start Date': '30-04-2024',
          'Trip End Date': '30-04-2024', 'Daily Journey Start Date': '30-04-2024',
          'Daily Journey End Date': '30-04-2024' }),
    row({ 'Trip ID': '7000302811', 'Travel ID': '60122873', 'Trip Start Date': '01-05-2024',
          'Trip End Date': '01-05-2024', 'Daily Journey Start Date': '01-05-2024',
          'Daily Journey End Date': '01-05-2024' }),
  ], ref)
  assert.equal(plan.bookings.length, 2, 'one Trip ID, two bookings')
  assert.deepEqual(plan.bookings.map(b => b.travelId).sort(), ['60122872', '60122873'])
  assert.notEqual(plan.bookings[0].startDate, plan.bookings[1].startDate)
}

// ── a multi-day trip is one booking with one duty per row ───────────────────
{
  const plan = buildImportPlan([
    row({}),
    row({ 'Trip End Date': '17-01-2024', 'Daily Journey Start Date': '17-01-2024', 'Daily Journey End Date': '17-01-2024' }),
  ].map(r => ({ ...r, 'Trip End Date': '17-01-2024' })), ref)
  assert.equal(plan.bookings.length, 1)
  assert.equal(plan.bookings[0].duties.length, 2, 'one duty per sheet row')
  assert.ok(plan.bookings[0].ok)
  assert.equal(plan.ready.length, 1)
}

// ── the swapped-times repair reaches the duty, not just the tally ───────────
{
  const plan = buildImportPlan([row({
    'Daily Journey Start Time': '20:30:00', 'Daily Journey End Time': '17:00:00',
    'Daily Journey Time': '4',
  })], ref)
  assert.equal(plan.fixTally.swapped, 1)
  assert.equal(plan.bookings[0].duties[0].reporting_time, '17:00:00')
  assert.equal(plan.bookings[0].duties[0].est_drop_time, '20:30:00')
}

// ── unresolvable windows block the booking rather than importing a bad duty ─
{
  const plan = buildImportPlan([row({
    'Daily Journey Start Time': '22:00:00', 'Daily Journey End Time': '10:00:00',
    'Daily Journey Time': '12',
  })], ref)
  assert.equal(plan.unresolved.length, 1)
  assert.ok(plan.bookings[0].blockers.includes('time'))
  assert.equal(plan.ready.length, 0)
  assert.equal(plan.bookings[0].duties.length, 0, 'no duty is fabricated')
}

// ── missing references block, and are counted by blast radius ───────────────
{
  const plan = buildImportPlan([
    row({ 'Company GSTIN': '27AAJCR6636B1ZC', 'Company name': 'Reliance Project and Property' }),
    row({ 'Travel ID': '999', 'Car Type': 'Superium Deluxe' }),
    row({ 'Travel ID': '998', 'Source': 'Nerul' }),
  ], ref)
  assert.equal(plan.ready.length, 0)
  assert.equal(plan.missingCustomers[0].key, '27AAJCR6636B1ZC')
  assert.equal(plan.missingCustomers[0].label, 'Reliance Project and Property')
  assert.ok(plan.missingDutyTypes.some(m => m.key === 'Hourly | Superium Deluxe'),
    'an unmatched car type is reported, never folded onto a similar one')
  assert.ok(plan.missingLocations.some(m => m.key === 'Nerul'))
}

// ── a booking already imported WITH duties is skipped, not duplicated ───────
{
  const plan = buildImportPlan([row({})], { ...ref, existingDuties: { '60082453': ['2024-01-16'] } })
  assert.equal(plan.bookings[0].alreadyImported, true)
  assert.equal(plan.bookings[0].ok, false, 'skipped, not re-created')
  assert.equal(plan.ready.length, 0)
  assert.equal(plan.incomplete.length, 0, 'nothing new in the file')
}

// ── a booking left duty-less by an interrupted run is re-run, not skipped ───
{
  const plan = buildImportPlan([row({})], { ...ref, existingDuties: { '60082453': [] } })
  assert.equal(plan.bookings[0].alreadyImported, false, 'no duties means it was never finished')
  assert.equal(plan.ready.length, 1)
}

// ── a long trip split across two exports must not be silently skipped ───────
// One sample trip runs 1 Jan to 30 Apr; a client sending it month by month would
// otherwise lose every day after the first file.
{
  const days = ['16-01-2024', '17-01-2024', '18-01-2024']
  const plan = buildImportPlan(
    days.map(d => row({
      'Trip End Date': '18-01-2024',
      'Daily Journey Start Date': d, 'Daily Journey End Date': d,
    })),
    { ...ref, existingDuties: { '60082453': ['2024-01-16'] } },
  )
  assert.equal(plan.incomplete.length, 1, 'reported rather than skipped')
  assert.equal(plan.incomplete[0].existingDuties, 1)
  assert.equal(plan.incomplete[0].inSheet, 3)
  assert.deepEqual(plan.incomplete[0].missingDates, ['2024-01-17', '2024-01-18'])
  assert.equal(plan.bookings[0].alreadyImported, false)
}

// ── two rows for the same day become one duty, and are reported ─────────────
{
  const plan = buildImportPlan([row({}), row({})], ref)
  assert.equal(plan.bookings.length, 1)
  assert.equal(plan.bookings[0].duties.length, 1, 'the repeated day collapses')
  assert.equal(plan.duplicateRows.length, 1)
  assert.equal(plan.duplicateRows[0].count, 2)
  assert.equal(plan.duplicateRows[0].date, '16-01-2024')
}

// ── the payload carries no money, no vehicle and no status ─────────────────
{
  const plan = buildImportPlan([row({})], ref)
  const p = bookingPayload(plan.bookings[0])
  for (const banned of ['status', 'company_id', 'base_rate', 'extra_km_rate', 'extra_hour_rate', 'vehicle_id']) {
    assert.ok(!(banned in p), `payload must not carry ${banned}`)
  }
  assert.equal(p.customer_name, 'M/s .Reliance Industries ltd (27AAACR5055K1Z7)')
  assert.equal(p.duty_type, 'Hourly | Sedan')
  assert.equal(p.vehicle_group, 'Sedan')
  assert.equal(p.booking_type, 'local')
  assert.equal(p.is_airport_booking, false)
  assert.equal(p.start_date, '2024-01-16')
}

console.log('importBookings.check.ts — all assertions passed')
