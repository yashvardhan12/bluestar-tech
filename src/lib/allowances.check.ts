// Self-check for the allowance money path. No test framework is installed and
// none is being added — run it directly:
//
//   node --experimental-strip-types src/lib/allowances.check.ts
//
// It exits non-zero on the first failed assertion.
//
// The two worked examples below are the ones printed in the client proposal
// (_bmad-output/planning-artifacts/allowances-client-proposal.html). If a rule
// changes, these totals move and the document is out of date.

// No timezone pin: atTime() builds local Dates from parts and closedAt is
// compared as an absolute instant, so every total below holds in any zone.
// Run it under TZ=America/New_York to confirm.

import assert from 'node:assert/strict'
import {
  computeAllowances, quantityFor, driverTotal, customerTotal,
  daysSpanned, nightsSpanned, ceilHours, weekdayName,
  extraHourMins, MONTHLY_INCLUDED_HOURS,
  type AllowanceRule, type DutyFacts,
} from './allowances.ts'

// ── date and hour primitives ────────────────────────────────────────────────

assert.equal(weekdayName('2026-08-10'), 'Monday', '10 Aug 2026 is a Monday')
assert.equal(weekdayName('2026-08-09'), 'Sunday')

assert.equal(daysSpanned('2026-08-10', '2026-08-12'), 3, 'both ends count')
assert.equal(daysSpanned('2026-08-10', '2026-08-10'), 1)
assert.equal(nightsSpanned('2026-08-10', '2026-08-12'), 2, 'midnights crossed')
assert.equal(nightsSpanned('2026-08-10', '2026-08-10'), 0)

assert.equal(ceilHours(0), 0, 'on time is not overtime')
assert.equal(ceilHours(-30), 0, 'finishing early is never a deduction')
assert.equal(ceilHours(1), 1, 'one minute is a whole hour, no grace')
assert.equal(ceilHours(60), 1)
assert.equal(ceilHours(61), 2)

// ── the company rate card ───────────────────────────────────────────────────

const RULES: AllowanceRule[] = [
  { id: 1, code: 'daily',                unit: 'day',   baseline: 'duty_window', driverRate: 300, isActive: true },
  { id: 2, code: 'overtime',             unit: 'hour',  baseline: 'duty_window', driverRate: 150, isActive: true },
  { id: 3, code: 'outstation',           unit: 'day',   baseline: 'duty_window', driverRate: 500, isActive: true },
  { id: 4, code: 'outstation_overnight', unit: 'night', baseline: 'duty_window', driverRate: 400, isActive: true },
  { id: 5, code: 'off_day',              unit: 'duty',  baseline: 'duty_window', driverRate: 600, isActive: true },
  { id: 6, code: 'early_start',          unit: 'hour',  baseline: 'duty_window', driverRate: 150, isActive: true },
  { id: 7, code: 'night',                unit: 'night', baseline: 'duty_window', driverRate: 250, isActive: true },
  { id: 8, code: 'extra_duty',           unit: 'duty',  baseline: 'duty_window', driverRate: 400, isActive: true },
  { id: 9, code: 'airport',              unit: 'duty',  baseline: 'duty_window', driverRate: 200, isActive: true },
  // Bills the customer only: driver pay for a long monthly day is the overtime
  // allowance's job, not this one's.
  { id: 10, code: 'extra_hour',          unit: 'hour',  baseline: 'duty_window', driverRate: null, isActive: true },
]

const DUTY: DutyFacts = {
  status: 'Completed',
  startDate: '2026-08-05', endDate: '2026-08-05',
  reportingTime: '06:00', estDropTime: '09:00',
  startedAt: null, closedAt: null,
  category: 'Hourly', isAirportBooking: false,
  dutyIndexOfDay: 1,
  driverOffDay: 'Sunday', driverShiftStart: null, driverShiftEnd: null,
}

const byCode = (lines: ReturnType<typeof computeAllowances>, code: string) =>
  lines.find(l => l.code === code)

// ── worked example A: outstation, 3 days / 2 nights, off day, 90 min over ───
{
  const duty: DutyFacts = {
    ...DUTY,
    startDate: '2026-08-10', endDate: '2026-08-12',
    reportingTime: '09:00',  estDropTime: '18:00',
    startedAt: '2026-08-10T09:00:00', closedAt: '2026-08-12T19:30:00',
    category: 'Outstation',
    driverOffDay: 'Monday',            // 10 Aug 2026 is a Monday
  }
  // Night and off day are deliberately absent: the operator never priced them.
  const rates = { 1: 400, 3: 700, 4: 500, 2: 200 }
  const lines = computeAllowances(duty, RULES, rates)

  assert.equal(byCode(lines, 'daily')!.qty, 3)
  assert.equal(byCode(lines, 'outstation')!.qty, 3)
  assert.equal(byCode(lines, 'outstation_overnight')!.qty, 2)
  assert.equal(byCode(lines, 'night')!.qty, 2, 'night stacks with outstation overnight')
  assert.equal(byCode(lines, 'off_day')!.qty, 1)
  assert.equal(byCode(lines, 'overtime')!.qty, 2, '90 minutes rounds up to 2 hours')
  assert.equal(byCode(lines, 'early_start'), undefined, 'started on time')
  assert.equal(byCode(lines, 'airport'), undefined)
  assert.equal(byCode(lines, 'extra_duty'), undefined, 'first duty of the day')

  assert.equal(byCode(lines, 'night')!.customerRate, null, 'unpriced stays null')
  assert.equal(byCode(lines, 'night')!.customerAmount, 0)
  assert.equal(byCode(lines, 'night')!.driverAmount, 500, 'unpriced still pays the driver')

  assert.equal(driverTotal(lines), 4600)
  assert.equal(customerTotal(lines), 4700)
}

// ── worked example B: airport, early start, second duty of the day ──────────
{
  const duty: DutyFacts = {
    ...DUTY,
    startedAt: '2026-08-05T04:20:00',   // 100 min before the 06:00 report
    closedAt:  '2026-08-05T09:00:00',   // exactly on time
    category: 'Airport',
    dutyIndexOfDay: 2,
  }
  const rates = { 1: 400, 9: 300, 6: 200 }   // extra duty deliberately unpriced
  const lines = computeAllowances(duty, RULES, rates)

  assert.equal(byCode(lines, 'daily')!.qty, 1)
  assert.equal(byCode(lines, 'airport')!.qty, 1)
  assert.equal(byCode(lines, 'early_start')!.qty, 2, '1h40 rounds up to 2 hours')
  assert.equal(byCode(lines, 'extra_duty')!.qty, 1, 'one per duty after the first')
  assert.equal(byCode(lines, 'overtime'), undefined, 'closed exactly on time')
  assert.equal(byCode(lines, 'night'), undefined, 'single day crosses no midnight')

  assert.equal(driverTotal(lines), 1200)
  assert.equal(customerTotal(lines), 1100)
}

// ── extra duty accumulates across the day, one per duty after the first ─────
{
  const rule = RULES.find(r => r.code === 'extra_duty')!
  const qtys = [1, 2, 3].map(i => quantityFor(rule, { ...DUTY, dutyIndexOfDay: i }))
  assert.deepEqual(qtys, [0, 1, 1])
  assert.equal(qtys.reduce((a, b) => a + b, 0), 2, 'three duties earn two allowances')
}

// ── a cancelled duty earns nothing on either side ───────────────────────────
{
  const duty: DutyFacts = { ...DUTY, status: 'Cancelled', category: 'Outstation' }
  assert.deepEqual(computeAllowances(duty, RULES, { 1: 400, 3: 700 }), [])
}

// ── switching an allowance off removes it from both sides ───────────────────
{
  const rules = RULES.map(r => r.code === 'daily' ? { ...r, isActive: false } : r)
  const lines = computeAllowances({ ...DUTY, category: 'Airport' }, rules, { 1: 400, 9: 300 })
  assert.equal(byCode(lines, 'daily'), undefined)
  assert.equal(byCode(lines, 'airport')!.qty, 1, 'the others are unaffected')
}

// ── a duty with no recorded timings yields no hourly allowances ─────────────
{
  const duty: DutyFacts = { ...DUTY, startedAt: null, closedAt: null }
  const lines = computeAllowances(duty, RULES, {})
  assert.equal(byCode(lines, 'overtime'), undefined)
  assert.equal(byCode(lines, 'early_start'), undefined)
  assert.equal(byCode(lines, 'daily')!.qty, 1, 'day-based allowances still apply')
}

// ── the overtime baseline ───────────────────────────────────────────────────
{
  const duty: DutyFacts = {
    ...DUTY,
    estDropTime: '18:00',
    driverShiftEnd: '17:00',
    closedAt: '2026-08-05T18:30:00',
  }
  const window = { ...RULES[1], baseline: 'duty_window' as const }
  const shift  = { ...RULES[1], baseline: 'driver_shift' as const }

  assert.equal(quantityFor(window, duty), 1, '30 min past the scheduled drop')
  assert.equal(quantityFor(shift, duty), 2, '90 min past the shift end')

  // Every driver in production has blank shift times. Falling back to the duty
  // window is what stops the allowance paying nothing at all.
  assert.equal(quantityFor(shift, { ...duty, driverShiftEnd: null }), 1, 'falls back')
}

// ── rates that produce paise still land on two decimals ─────────────────────
{
  const rules: AllowanceRule[] = [
    { id: 1, code: 'daily', unit: 'day', baseline: 'duty_window', driverRate: 33.333, isActive: true },
  ]
  const duty: DutyFacts = { ...DUTY, startDate: '2026-08-10', endDate: '2026-08-12' }
  const lines = computeAllowances(duty, rules, { 1: 16.665 })
  assert.equal(lines[0].driverAmount, 100)
  assert.equal(lines[0].customerAmount, 50)
}

console.log('allowances.check.ts — all assertions passed')


// ── monthly extra hours: per day, past 12, on real use ──────────────────────
{
  const rule = RULES.find(r => r.code === 'extra_hour')!
  // One monthly day. dutyWindows.ts gives Monthly one duty per day, so start
  // and end date being equal is the normal shape, not an edge case.
  const day: DutyFacts = {
    ...DUTY,
    category: 'Monthly',
    startDate: '2026-08-05', endDate: '2026-08-05',
    startedAt: '2026-08-05T08:00:00',
    closedAt:  '2026-08-05T22:00:00',   // ran 14h
  }

  assert.equal(extraHourMins(day), 120, '14h against a 12h package is 120 minutes')
  assert.equal(quantityFor(rule, day), 2, 'two extra hours')

  assert.equal(
    quantityFor(rule, { ...day, closedAt: '2026-08-05T20:00:00' }), 0,
    'exactly 12 hours is inside the package',
  )
  assert.equal(
    quantityFor(rule, { ...day, closedAt: '2026-08-05T18:00:00' }), 0,
    'a short day is never a deduction',
  )
  assert.equal(
    quantityFor(rule, { ...day, closedAt: '2026-08-05T20:01:00' }), 1,
    'one minute over is a whole hour, same as every other hourly rule',
  )

  // Measured on use, not on the plan: the scheduled window is irrelevant here,
  // which is exactly what separates this from the overtime allowance.
  assert.equal(
    quantityFor(rule, { ...day, reportingTime: '08:00', estDropTime: '23:00' }), 2,
    'a generous scheduled window does not absorb the extra hours',
  )

  // Crossing midnight: a monthly day that closes at 01:00 the next morning ran
  // 17 hours, and the duty's own end_date moves with it.
  assert.equal(
    quantityFor(rule, { ...day, endDate: '2026-08-06', closedAt: '2026-08-06T01:00:00' }), 5,
    '08:00 to 01:00 is 17 hours, five of them extra',
  )

  assert.equal(quantityFor(rule, { ...day, startedAt: null }), 0, 'never started, never charged')
  assert.equal(quantityFor(rule, { ...day, closedAt: null }), 0, 'still open, nothing measured yet')
  assert.equal(quantityFor(rule, { ...day, category: 'Hourly' }), 0, 'monthly only')
  assert.equal(quantityFor(rule, { ...day, category: 'Outstation' }), 0)
  assert.equal(quantityFor(rule, { ...day, category: null }), 0, 'an unmatched duty type charges nothing')
}

// ── extra hours price off the duty type, and reach the customer only ────────
{
  const day: DutyFacts = {
    ...DUTY,
    category: 'Monthly',
    startedAt: '2026-08-05T08:00:00',
    closedAt:  '2026-08-05T22:00:00',
  }
  // 10 is extra_hour: dutyAllowances.ts injects duty_types.extra_hour_rate here
  // rather than reading duty_type_allowances, but computeAllowances cannot tell.
  const lines = computeAllowances(day, RULES, { 10: 250 })
  const extra = byCode(lines, 'extra_hour')!

  assert.equal(extra.qty, 2)
  assert.equal(extra.customerAmount, 500, '2 hours × 250')
  assert.equal(extra.driverAmount, 0, 'no driver rate set, so the driver side stays zero')

  // A monthly duty type with the field left blank bills nothing, rather than
  // billing zero-rate lines that read as priced on the invoice.
  const unpriced = computeAllowances(day, RULES, {})
  assert.equal(byCode(unpriced, 'extra_hour')!.customerAmount, 0)
}

assert.equal(MONTHLY_INCLUDED_HOURS, 12, 'the package everything above assumes')
