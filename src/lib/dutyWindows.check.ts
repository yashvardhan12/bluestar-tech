// node --experimental-strip-types src/lib/dutyWindows.check.ts
//
// The duty fan-out is the rule an importer is most likely to bypass: insert into
// `bookings` alone and you get a booking that lists fine and is empty on the
// Duties page. These assert the shape both callers depend on.

import assert from 'node:assert/strict'
import { generateDutyRows } from './dutyWindows.ts'

// ── Airport / Outstation: one duty spanning the whole window ────────────────
{
  const r = generateDutyRows('Airport', '2024-02-21', '2024-02-22')
  assert.equal(r.length, 1)
  assert.deepEqual(r[0], { start_date: '2024-02-21', end_date: '2024-02-22' })
}
{
  const r = generateDutyRows('Outstation', '2024-01-16', '2024-01-22')
  assert.equal(r.length, 1, 'a 7-day outstation trip is still one duty')
}

// ── Hourly / Monthly: one duty per day, inclusive of both ends ──────────────
{
  const r = generateDutyRows('Hourly', '2024-01-16', '2024-01-22')
  assert.equal(r.length, 7, 'inclusive of both ends')
  assert.deepEqual(r[0], { start_date: '2024-01-16', end_date: '2024-01-16' })
  assert.deepEqual(r[6], { start_date: '2024-01-22', end_date: '2024-01-22' })
  assert.ok(r.every(d => d.start_date === d.end_date), 'each daily duty is one day')
}
{
  const r = generateDutyRows('Monthly', '2024-01-16', '2024-01-16')
  assert.equal(r.length, 1, 'a single-day range is one duty, not zero')
}

// Month and year boundaries — the fan-out walks real dates, not day arithmetic.
assert.equal(generateDutyRows('Hourly', '2024-02-27', '2024-03-02').length, 5, '2024 is a leap year')
assert.equal(generateDutyRows('Hourly', '2023-02-27', '2023-03-02').length, 4)
assert.equal(generateDutyRows('Hourly', '2024-12-30', '2025-01-02').length, 4, 'crosses new year')

// ── unusable ranges yield nothing rather than a bad row ────────────────────
assert.deepEqual(generateDutyRows('Hourly', '2024-01-22', '2024-01-16'), [], 'backwards range')
assert.deepEqual(generateDutyRows('Hourly', '', '2024-01-16'), [])
assert.deepEqual(generateDutyRows('Airport', '2024-01-16', ''), [])

// An unknown category falls to the per-day branch rather than silently
// producing one duty for a month.
assert.equal(generateDutyRows('', '2024-01-16', '2024-01-18').length, 3)

console.log('dutyWindows.check.ts — all assertions passed')
