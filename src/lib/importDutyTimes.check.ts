// node --experimental-strip-types src/lib/importDutyTimes.check.ts
//
// The swap-vs-rollover decision is the one piece of import logic that silently
// misprices a booking when it gets the answer wrong: for Intra City the hour
// count picks the rate slab, so a 3.5h duty read as 20.5h bills a different
// package. These cases are taken from the real export.

import assert from 'node:assert/strict'
import { parseSheetDate, resolveDutyTimes, tripWindowViolation } from './importDutyTimes.ts'

// ── date parsing ────────────────────────────────────────────────────────────
assert.equal(parseSheetDate('16-01-2024'), '2024-01-16')
assert.equal(parseSheetDate('01-05-2024'), '2024-05-01', 'dd-mm, never mm-dd')
assert.throws(() => parseSheetDate('2024-01-16'), /Unrecognised date/)
assert.throws(() => parseSheetDate('16-13-2024'), /Impossible date/)

// The calendar, not just the ranges. 31-02 passes a 1..31 day test and then
// sails through the resolver as a confident answer, because every comparison
// against a NaN date is false.
assert.throws(() => parseSheetDate('31-02-2024'), /Impossible date/)
assert.throws(() => parseSheetDate('30-02-2024'), /Impossible date/)
assert.throws(() => parseSheetDate('31-04-2024'), /Impossible date/)
assert.throws(() => parseSheetDate('29-02-2025'), /Impossible date/, 'not a leap year')
assert.equal(parseSheetDate('29-02-2024'), '2024-02-29', '2024 is a leap year')
assert.throws(() => resolveDutyTimes({
  startDate: '31-02-2024', endDate: '31-02-2024',
  startTime: '20:30:00', endTime: '17:00:00', statedHours: 4,
}), /Impossible date/, 'an impossible date must never reach the swap/roll arithmetic')

// ── trip-window containment ─────────────────────────────────────────────────
// Not the `Month` column: that is the settlement month and lags travel by up to
// 3 months, so it flagged 192 correct rows in the sample.
assert.equal(tripWindowViolation('2024-01-16', '2024-01-16', '2024-01-16', '2024-01-22'), null)
assert.equal(tripWindowViolation('2024-01-22', '2024-01-22', '2024-01-16', '2024-01-22'), null, 'last day is inside')
// A duty that crosses midnight rolls its own end while the trip end stays put.
assert.equal(tripWindowViolation('2024-05-21', '2024-05-22', '2024-05-21', '2024-05-21'), null,
  'one-day overshoot on the end is a legitimate midnight crossing')
assert.match(tripWindowViolation('2024-01-15', '2024-01-15', '2024-01-16', '2024-01-22')!, /Duty starts/)
assert.match(tripWindowViolation('2024-01-23', '2024-01-23', '2024-01-16', '2024-01-22')!, /Duty starts/)
assert.match(tripWindowViolation('2024-05-21', '2024-05-24', '2024-05-21', '2024-05-21')!, /Duty ends/,
  'two days past the trip end is not a midnight crossing')

// ── coherent window: untouched ──────────────────────────────────────────────
{
  const r = resolveDutyTimes({
    startDate: '16-01-2024', endDate: '16-01-2024',
    startTime: '11:00:00', endTime: '23:00:00', statedHours: 12,
  })
  assert.equal(r.fix, 'none')
  assert.equal(r.startDate, '2024-01-16')
  assert.equal(r.reportingTime, '11:00:00')
  assert.equal(r.estDropTime, '23:00:00')
}

// ── swapped: 20:30 -> 17:00 stated 4h. Real duty is 17:00-20:30. ────────────
{
  const r = resolveDutyTimes({
    startDate: '19-02-2024', endDate: '19-02-2024',
    startTime: '20:30:00', endTime: '17:00:00', statedHours: 4,
  })
  assert.equal(r.fix, 'swapped')
  assert.equal(r.reportingTime, '17:00:00')
  assert.equal(r.estDropTime, '20:30:00')
  assert.equal(r.endDate, '2024-02-19', 'a swap must not move the date')
}

// ── rolled: 23:30 -> 00:30 stated 1h. Genuine midnight crossing. ────────────
{
  const r = resolveDutyTimes({
    startDate: '21-02-2024', endDate: '21-02-2024',
    startTime: '23:30:00', endTime: '00:30:00', statedHours: 1,
  })
  assert.equal(r.fix, 'rolled')
  assert.equal(r.endDate, '2024-02-22', 'end rolls to the next day')
  assert.equal(r.reportingTime, '23:30:00', 'a rollover must not reorder the times')
  assert.equal(r.estDropTime, '00:30:00')
}

// The same clock times with the *other* stated duration must go the other way —
// this is the whole point of refereeing per row rather than per file.
{
  const r = resolveDutyTimes({
    startDate: '21-02-2024', endDate: '21-02-2024',
    startTime: '23:30:00', endTime: '00:30:00', statedHours: 23,
  })
  assert.equal(r.fix, 'swapped')
  assert.equal(r.reportingTime, '00:30:00')
}

// ── month and year rollover ─────────────────────────────────────────────────
{
  const r = resolveDutyTimes({
    startDate: '31-12-2024', endDate: '31-12-2024',
    startTime: '23:00:00', endTime: '01:00:00', statedHours: 2,
  })
  assert.equal(r.fix, 'rolled')
  assert.equal(r.endDate, '2025-01-01')
}

// ── ambiguous: a 12h duty fits both readings exactly ────────────────────────
{
  const r = resolveDutyTimes({
    startDate: '19-02-2024', endDate: '19-02-2024',
    startTime: '18:00:00', endTime: '06:00:00', statedHours: 12,
  })
  assert.equal(r.fix, 'ambiguous')
  assert.match(r.reason!, /indistinguishable/)
}

// ── ambiguous: no stated duration to referee with ───────────────────────────
{
  const r = resolveDutyTimes({
    startDate: '19-02-2024', endDate: '19-02-2024',
    startTime: '20:30:00', endTime: '17:00:00', statedHours: null,
  })
  assert.equal(r.fix, 'ambiguous')
}

// ── ambiguous: neither reading is close to the stated hours ─────────────────
{
  const r = resolveDutyTimes({
    startDate: '19-02-2024', endDate: '19-02-2024',
    startTime: '20:30:00', endTime: '17:00:00', statedHours: 9,
  })
  assert.equal(r.fix, 'ambiguous')
  assert.match(r.reason!, /Neither reading/)
}

// ── ambiguous: end date before start date ───────────────────────────────────
{
  const r = resolveDutyTimes({
    startDate: '20-02-2024', endDate: '19-02-2024',
    startTime: '10:00:00', endTime: '12:00:00', statedHours: 2,
  })
  assert.equal(r.fix, 'ambiguous')
  assert.match(r.reason!, /before the start/)
}

// ── an already-correct multi-day crossing stays untouched ───────────────────
{
  const r = resolveDutyTimes({
    startDate: '21-02-2024', endDate: '22-02-2024',
    startTime: '23:30:00', endTime: '00:30:00', statedHours: 1,
  })
  assert.equal(r.fix, 'none')
  assert.equal(r.endDate, '2024-02-22')
}

console.log('importDutyTimes.check.ts — all assertions passed')
