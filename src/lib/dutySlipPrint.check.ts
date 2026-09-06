// node --experimental-strip-types src/lib/dutySlipPrint.check.ts
//
// Holds the category branch shut. The rule the whole file exists to enforce is
// that no category's strip mentions a figure that category is not priced on —
// so each case is asserted against facts where every *other* category's inputs
// are deliberately filled in.

// isNightDuty() reads the browser's local clock, so the night assertions below
// are only meaningful in a stated zone. Pinned to the one the fleet runs on,
// the same zone 026_duty_status_view.sql hardcodes. Set before any Date is
// constructed — imports do not build one at load time.
process.env.TZ = 'Asia/Kolkata'

import assert from 'node:assert'
import {
  badges, typeStrip, totalNotes, legRow, plannedWindow, hoursLabel, hm,
  type PrintFacts,
} from './dutySlipPrint.ts'

// One duty, every field populated, so a strip that reads the wrong one shows up.
const base: PrintFacts = {
  category: 'Hourly',
  isAirportBooking: false,
  toLocation: 'Pune',
  startDate: '2026-08-31',
  endDate: '2026-08-31',
  reportingTime: '07:00:00',
  estDropTime: '23:59:00',
  startedAt: '2026-08-31T09:52:00.000Z',
  closedAt: '2026-08-31T13:32:00.000Z',
  startOdo: 113553,
  endOdo: 113602,
  totalKm: null,
  thresholdKm: 200,
}

const labels = (f: PrintFacts) => typeStrip(f).map(s => s.label).join(' | ')
const values = (f: PrintFacts) => typeStrip(f).map(s => s.value).join(' | ')

// ── formatting ──────────────────────────────────────────────────────────────
assert.equal(hm('07:00:00'), '07:00')
assert.equal(hm(null), '—')
assert.equal(hoursLabel(3.5), '3:30')
assert.equal(hoursLabel(13), '13:00')
assert.equal(hoursLabel(null), '—')
assert.equal(plannedWindow(base), '31/08/2026  07:00   TO   31/08/2026  23:59')

// ── km and hours come off the same helpers the invoice prices on ────────────
{
  const leg = legRow(base)
  assert.equal(leg.open, '113553')
  assert.equal(leg.close, '113602')
  assert.equal(leg.totalKm, '49', 'odometer pair wins')
  // 09:52 → 13:32 is 3h40, rounded to the half hour the bands are sold in.
  assert.equal(leg.totalHrs, '3:30')
  assert.equal(leg.combined, '49 / 3:30')
}

// A duty closed with no readings at all still prints; the blanks are the point.
{
  const leg = legRow({ ...base, startOdo: null, endOdo: null, totalKm: null, startedAt: null, closedAt: null })
  assert.equal(leg.combined, '— / —')
  assert.equal(leg.rep, '—')
}

// total_km typed straight in is the way out when nobody wrote the odometer down.
assert.equal(legRow({ ...base, startOdo: null, endOdo: null, totalKm: 88 }).totalKm, '88')

// ── each category names only what it is priced on ───────────────────────────

// Hourly: both pairs matter, and which side of the threshold it fell decides
// whether it bills on bands or on distance.
assert.match(labels(base), /Package window/)
assert.match(labels(base), /Distance threshold/)
assert.match(values(base), /49 km — under threshold/)
assert.match(values({ ...base, endOdo: 113553 + 250 }), /over threshold/)

// Airport: fixed by zone. The strip must not talk about distance or bands, and
// both totals are marked so nobody argues a rate from them.
{
  const f: PrintFacts = { ...base, category: 'Airport', isAirportBooking: true }
  assert.doesNotMatch(labels(f), /threshold|Distance|window/i, 'airport is priced on neither')
  assert.match(labels(f), /Night charge/)
  assert.deepEqual(totalNotes(f), { km: 'record only', hrs: 'record only' })
  // Released at 19:02 local — not a night duty.
  assert.match(values(f), /Does not apply/)
  assert.match(values({ ...f, closedAt: '2026-08-31T18:40:00.000Z' }), /Applies/, 'released 00:10 local')
}

// Outstation: distance and days. Never a night line — the settlement sheet is
// explicit that night does not apply, and outstationLines() never reads it.
{
  const f: PrintFacts = { ...base, category: 'Outstation', startDate: '2026-09-02', endDate: '2026-09-04' }
  assert.doesNotMatch(labels(f), /[Nn]ight charge/, 'night never applies to outstation')
  assert.doesNotMatch(labels(f), /threshold|window/i)
  assert.match(values(f), /^3 \| 2 \| /, '3 days spanned, 2 nights halted')
}

// Monthly: hours against the included allowance. No car hire figure at all —
// priceDuty() returns null for Monthly on purpose.
{
  const f: PrintFacts = { ...base, category: 'Monthly', startDate: '2026-09-05', endDate: '2026-09-05' }
  assert.match(labels(f), /Included/)
  assert.match(values(f), /12 hrs per day/)
  // 3:30 ran against 12 included is no excess, not a negative one.
  assert.match(values(f), /None/)
  const long = { ...f, closedAt: '2026-09-05T23:52:00.000Z' }
  assert.match(values(long), /chargeable/)
  assert.equal(totalNotes(f).km, 'against monthly pool')
}

// duties.duty_type is free text and much of it matches no rate card. The slip
// still has to print, and has to say why it cannot be billed from.
{
  const f: PrintFacts = { ...base, category: null }
  assert.equal(badges(f).primary, 'DUTY')
  assert.match(values(f), /No rate card matched/)
  assert.deepEqual(totalNotes(f), { km: null, hrs: null })
}

// ── badges ──────────────────────────────────────────────────────────────────
assert.deepEqual(badges(base), { primary: 'LOCAL', secondary: '' })
assert.deepEqual(badges({ ...base, isAirportBooking: true }), { primary: 'LOCAL', secondary: 'AIRPORT PICKUP' })
assert.deepEqual(badges({ ...base, category: 'Outstation' }), { primary: 'OUTSTATION', secondary: 'PUNE' })
assert.equal(badges({ ...base, category: 'Monthly', startDate: '2026-09-05' }).secondary, 'SEP 2026')

console.log('dutySlipPrint.check.ts — all assertions passed')
