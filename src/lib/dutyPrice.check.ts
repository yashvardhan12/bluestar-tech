// node --experimental-strip-types src/lib/dutyPrice.check.ts
//
// Every priced row of the client's settlement sheet (Relation.xlsx, "RIL Duty
// Types") reproduced from the rate card. If one of these totals moves, the
// invoice disagrees with the customer's own workbook and the change is wrong
// until the client says otherwise.

import assert from 'node:assert'
import { priceDuty, hoursRun, hourBands, isNightDuty, type RateCard } from './dutyPrice.ts'

const card = (o: Partial<RateCard>): RateCard => ({
  category: 'Hourly', fixedCharges: null, thresholdKm: null,
  rate0to6Hrs: null, rate6to12Hrs: null, rate12PlusHrs: null,
  ratePerKm: null, nightCharges: null, dailyOutstationCharges: null, ...o,
})

/** One day, pickup to release, as the sheet writes them: HHMM, 2400 = midnight. */
const run = (pickup: number, release: number, km: number, expenses = 0) => {
  const t = (hhmm: number, day: number) =>
    `2025-01-0${day}T${String(Math.floor(hhmm / 100)).padStart(2, '0')}:${String(hhmm % 100).padStart(2, '0')}:00`
  return {
    startDate: '2025-01-01', endDate: '2025-01-01',
    startedAt: t(pickup, 1),
    closedAt: release >= 2400 ? t(release - 2400, 2) : t(release, 1),
    startOdo: null, endOdo: null, totalKm: km, expenses,
  }
}

/** An Outdoor row: the sheet gives distance only, no clock. */
const outdoor = (km: number, expenses = 0) => ({
  startDate: '2025-01-01', endDate: '2025-01-01',
  startedAt: null, closedAt: null,
  startOdo: null, endOdo: null, totalKm: km, expenses,
})

const total = (c: RateCard, r: ReturnType<typeof run> | ReturnType<typeof outdoor>) => {
  const p = priceDuty(c, r)
  assert.ok(p, 'priceable')
  return p.total
}

// ── the pieces ───────────────────────────────────────────────────────────────

assert.equal(hoursRun('2025-01-01T07:00:00', '2025-01-02T00:00:00'), 17, '07:00 to midnight is 17 hours')
// The sheet reads this as 8.5: its (1745-900)/100 treats 45 minutes as 0.45 of
// an hour. Real elapsed time is 8h45m, which is 9.0 at half-hour granularity.
assert.equal(hoursRun('2025-01-01T09:00:00', '2025-01-01T17:45:00'), 9, 'real elapsed time, rounded to the half hour')
assert.equal(hoursRun('2025-01-01T09:00:00', '2025-01-01T17:30:00'), 8.5, 'an exact half hour is untouched')
assert.equal(hoursRun('2025-01-01T09:00:00', '2025-01-01T09:20:00'), 0.5, '20 minutes rounds up to half an hour')
assert.equal(hoursRun('2025-01-01T09:00:00', null), null, 'an open duty has no hours')

assert.deepEqual(hourBands(17), [6, 6, 5], 'the sheet O/P/Q split at 17 hours')
assert.deepEqual(hourBands(4), [4, 0, 0], 'under six hours fills only the first band')
assert.deepEqual(hourBands(9.5), [6, 3.5, 0], 'the middle band takes the remainder')
assert.deepEqual(hourBands(12), [6, 6, 0], 'twelve hours does not open the 12+ band')

assert.equal(isNightDuty('2025-01-01T07:00:00', '2025-01-02T00:00:00'), true, 'released at midnight')
assert.equal(isNightDuty('2025-01-01T07:00:00', '2025-01-01T22:00:00'), false, 'released at 22:00 is not night')
assert.equal(isNightDuty('2025-01-01T07:00:00', '2025-01-01T23:00:00'), true, 'released at 23:00 is')
assert.equal(isNightDuty('2025-01-01T04:30:00', '2025-01-01T12:00:00'), true, 'picked up before 05:00')

// ── RIL - Sedan ──────────────────────────────────────────────────────────────

const sedan = card({ thresholdKm: 150, rate0to6Hrs: 276, rate6to12Hrs: 231, rate12PlusHrs: 179, ratePerKm: 16.75, nightCharges: 200 })

// row 8 — local, under the threshold: 1656 + 1386 + 895 + 200 night + 150 toll
assert.equal(total(sedan, run(700, 2400, 105, 150)), 4287, 'Sedan local, hour bands')
// row 10 — local, over the threshold: the bands drop out, 350 x 16.75 + 200 toll
assert.equal(total(sedan, run(700, 2200, 350, 200)), 6062.5, 'Sedan local, billed on distance')
// row 12 — outdoor: 325 x 16.75 + 500 DA + 300 toll
assert.equal(total(card({ category: 'Outstation', ratePerKm: 16.75, dailyOutstationCharges: 500 }), outdoor(325, 300)), 6243.75, 'Sedan outdoor')

// ── RIL - SUV ────────────────────────────────────────────────────────────────

assert.equal(total(card({ thresholdKm: 150, rate0to6Hrs: 321, rate6to12Hrs: 269, rate12PlusHrs: 206, ratePerKm: 17, nightCharges: 200 }), run(700, 2400, 105)), 4770, 'SUV local')
assert.equal(total(card({ category: 'Outstation', ratePerKm: 17, dailyOutstationCharges: 500 }), outdoor(250)), 4750, 'SUV outdoor')

// ── RIL - Premium SUV ────────────────────────────────────────────────────────

assert.equal(total(card({ thresholdKm: 150, rate0to6Hrs: 466, rate6to12Hrs: 386, rate12PlusHrs: 306, ratePerKm: 22, nightCharges: 200 }), run(700, 2400, 105)), 6842, 'Premium SUV local')
assert.equal(total(card({ category: 'Outstation', ratePerKm: 22, dailyOutstationCharges: 500 }), outdoor(250)), 6000, 'Premium SUV outdoor')

// ── the flat-hourly types ────────────────────────────────────────────────────
// One rate for every hour. Expressed as the same rate in all three bands, which
// collapses to hours x rate — see the note at the top of dutyPrice.ts.

const flat = (rate: number, perKm: number, night: number, threshold = 200) =>
  card({ thresholdKm: threshold, rate0to6Hrs: rate, rate6to12Hrs: rate, rate12PlusHrs: rate, ratePerKm: perKm, nightCharges: night })

// RIL - Super Premium Sedan: 17 x 578 + 300 night
assert.equal(total(flat(578, 37, 300), run(700, 2400, 105)), 10126, 'Super Premium Sedan local')
assert.equal(total(card({ category: 'Outstation', ratePerKm: 37, dailyOutstationCharges: 500 }), outdoor(250)), 9750, 'Super Premium Sedan outdoor')

// RIL - Deluxe: 17 x 706 + 500 night
assert.equal(total(flat(706, 46, 500), run(700, 2400, 105)), 12502, 'Deluxe local')
assert.equal(total(card({ category: 'Outstation', ratePerKm: 46, dailyOutstationCharges: 700 }), outdoor(250)), 12200, 'Deluxe outdoor')

// RIL - Supreme Deluxe: 17 x 834 + 500 night
assert.equal(total(flat(834, 52, 500), run(700, 2400, 105)), 14678, 'Supreme Deluxe local')
assert.equal(total(card({ category: 'Outstation', ratePerKm: 52, dailyOutstationCharges: 700 }), outdoor(250)), 13700, 'Supreme Deluxe outdoor')

// RIL - Super Deluxe: 150 km is still under the 200 km threshold, so hours win
assert.equal(total(flat(2052, 118, 500), run(700, 2400, 150, 150)), 35534, 'Super Deluxe local, 150 km still under the 200 km threshold')
assert.equal(total(card({ category: 'Outstation', ratePerKm: 118, dailyOutstationCharges: 700 }), outdoor(250, 150)), 30350, 'Super Deluxe outdoor')

// ── refusals and edges ───────────────────────────────────────────────────────

assert.equal(
  priceDuty(sedan, { ...run(700, 2400, 105), startedAt: null, closedAt: null }),
  null,
  'an unclosed local duty under the threshold cannot be priced, and must not read as zero',
)
assert.equal(
  priceDuty(card({ thresholdKm: 150, rate0to6Hrs: 276, ratePerKm: 16.75 }), run(700, 2400, 105)),
  null,
  'a band that ran with no rate on the card is a hole, not a free hour',
)
assert.equal(priceDuty(card({ category: 'Airport' }), run(700, 2400, 105)), null, 'Airport is a fixed charge, not priced from what ran')
assert.equal(priceDuty(card({ category: 'Monthly' }), run(700, 2400, 105)), null, 'Monthly is a package, not priced from what ran')

// The odometer pair wins over a typed distance, exactly as the duty slip reads it.
assert.equal(
  total(card({ category: 'Outstation', ratePerKm: 10, dailyOutstationCharges: 0 }),
    { ...outdoor(999), startOdo: 1000, endOdo: 1250 }),
  2500,
  'odometer readings beat the typed total',
)

// Multi-day outdoor pays the daily allowance per day, both ends counted.
assert.equal(
  total(card({ category: 'Outstation', ratePerKm: 10, dailyOutstationCharges: 500 }),
    { ...outdoor(100), endDate: '2025-01-03' }),
  2500,
  '100 km plus three days of allowance',
)

// ── Airport ──────────────────────────────────────────────────────────────────
// A fixed transfer charge. Distance and duration are recorded, never priced.

const airport = card({ category: 'Airport', fixedCharges: 1200, nightCharges: 250 })

assert.equal(total(airport, run(900, 1100, 40)), 1200, 'Airport is the fixed charge, whatever it ran')
assert.equal(total(airport, run(900, 2330, 800)), 1450, 'Airport picks up the night charge, and still ignores 800 km')
assert.equal(total(airport, outdoor(40)), 1200, 'Airport prices with no clock at all')
assert.equal(priceDuty(card({ category: 'Airport', nightCharges: 250 }), run(900, 1100, 40)), null, 'no fixed charge is a hole in the card, not a free transfer')

// ── the categories must not bleed into each other ────────────────────────────
//
// A duty type carries every column on the table whatever its category, so
// leftovers from an earlier edit are normal data. Each relation is priced here
// against a card with all the OTHER categories' fields filled in, and must land
// on the same total as one carrying only its own.

const polluted = {
  fixedCharges: 9999, thresholdKm: 1, rate0to6Hrs: 9999, rate6to12Hrs: 9999,
  rate12PlusHrs: 9999, ratePerKm: 9999, nightCharges: 9999,
  dailyOutstationCharges: 9999,
}

assert.equal(
  total(card({ ...polluted, category: 'Airport', fixedCharges: 1200, nightCharges: 250 }), run(900, 1100, 800)),
  1200,
  'Airport ignores threshold_km, the hour bands, rate_per_km and the daily allowance',
)

assert.equal(
  total(card({ ...polluted, category: 'Outstation', ratePerKm: 16.75, dailyOutstationCharges: 500 }), run(700, 2400, 325, 300)),
  6243.75,
  'Outstation ignores fixed_charges and the hour bands — and charges no night, however late it ends',
)

assert.equal(
  total(card({ ...polluted, category: 'Hourly', thresholdKm: 150, rate0to6Hrs: 276, rate6to12Hrs: 231, rate12PlusHrs: 179, nightCharges: 200 }), run(700, 2400, 105, 150)),
  4287,
  'Hourly under the threshold ignores fixed_charges, rate_per_km and the daily allowance',
)

assert.equal(
  total(card({ ...polluted, category: 'Hourly', thresholdKm: 150, ratePerKm: 16.75, nightCharges: 0 }), run(700, 2200, 350, 200)),
  6062.5,
  'Hourly over the threshold bills distance alone — the bands are an alternative, never an addition',
)

// Monthly is a package plus extra hours, and extra hours are an allowance.
assert.equal(priceDuty(card({ ...polluted, category: 'Monthly' }), run(700, 2400, 105)), null, 'Monthly is never priced from what ran, however complete its card')
assert.equal(priceDuty(card({ ...polluted, category: null }), run(700, 2400, 105)), null, 'a duty type with no category prices nothing')

console.log('dutyPrice.check.ts — all assertions passed')
