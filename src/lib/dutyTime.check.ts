// node --experimental-strip-types src/lib/dutyTime.check.ts
//
// The countdown is what a driver reads at 5:30am to decide whether to move, so
// the boundaries between "In 45m" and "In 1hr" are the part worth pinning.

import assert from 'node:assert/strict'
import {
  atTime, countdown, formatTime, departurePrompt, duration,
  localDate, toISODate, todayISO, formatDate,
} from './dutyTime.ts'

const now = new Date('2026-08-04T09:00:00')
const plus = (mins: number) => new Date(now.getTime() + mins * 60000)

// ── countdown ────────────────────────────────────────────────────────────────
assert.equal(countdown(plus(0), now), 'Now')
assert.equal(countdown(plus(1), now), 'In 1m')
assert.equal(countdown(plus(30), now), 'In 30m')
assert.equal(countdown(plus(59), now), 'In 59m')
assert.equal(countdown(plus(60), now), 'In 1hr')
assert.equal(countdown(plus(4 * 60), now), 'In 4hr')
assert.equal(countdown(plus(23 * 60), now), 'In 23hr')
assert.equal(countdown(plus(24 * 60), now), 'In 1d')
assert.equal(countdown(plus(-5), now), '5m ago')
assert.equal(countdown(plus(-59), now), '59m ago')
assert.equal(countdown(plus(-120), now), '2hr ago')
// The -60 boundary belongs to the hours branch, not "60m ago".
assert.equal(countdown(plus(-60), now), '1hr ago')

// ── atTime ───────────────────────────────────────────────────────────────────
// Postgres hands back "HH:MM:SS"; a duty with no reporting time is midnight.
assert.equal(atTime('2026-08-04', '07:30:00').getHours(), 7)
assert.equal(atTime('2026-08-04', '07:30:00').getMinutes(), 30)
assert.equal(atTime('2026-08-04', null).getHours(), 0)

// ── formatTime ───────────────────────────────────────────────────────────────
assert.equal(formatTime('09:00:00'), '9:00 am')
assert.equal(formatTime('12:05:00'), '12:05 pm')   // noon is 12pm, not 0pm
assert.equal(formatTime('00:30:00'), '12:30 am')   // midnight is 12am, not 0am
assert.equal(formatTime('18:45:00'), '6:45 pm')
assert.equal(formatTime(null), '—')

// ── departurePrompt ──────────────────────────────────────────────────────────
assert.equal(departurePrompt(60), 'Leave 1 hr before reporting time.')
assert.equal(departurePrompt(120), 'Leave 2 hr before reporting time.')
assert.equal(departurePrompt(45), 'Leave 45 min before reporting time.')
assert.equal(departurePrompt(90), 'Leave 1 hr 30 min before reporting time.')
// No allowance means no prompt at all, rather than "Leave 0 min before".
assert.equal(departurePrompt(null), null)
assert.equal(departurePrompt(0), null)

// ── duration ─────────────────────────────────────────────────────────────────
assert.equal(duration('2026-08-04T08:30:00Z', '2026-08-04T18:00:00Z'), '9 hr 30 min')
assert.equal(duration('2026-08-04T08:30:00Z', '2026-08-04T08:45:00Z'), '15 min')
// Clock skew must not render as a negative duration on a billing screen.
assert.equal(duration('2026-08-04T09:00:00Z', '2026-08-04T08:00:00Z'), '0 min')

// ── date boundaries ──────────────────────────────────────────────────────────
// These are the assertions that fail under `new Date('2026-08-12')`, which the
// spec parses as UTC midnight: west of UTC it lands on the 11th, and east of
// UTC `toISOString()` pushes local midnight back to the previous day. Run this
// file under TZ=America/New_York and TZ=Asia/Kolkata — it must pass in both.

{
  const d = localDate('2026-08-12')
  assert.equal(d.getFullYear(), 2026)
  assert.equal(d.getMonth(), 7, 'August is month 7')
  assert.equal(d.getDate(), 12, 'the 12th stays the 12th in every timezone')
  assert.equal(d.getHours(), 0, 'local midnight, not an offset from UTC')
}

assert.equal(toISODate(new Date(2026, 7, 12)), '2026-08-12')
assert.equal(toISODate(new Date(2026, 0, 1)), '2026-01-01', 'month and day are padded')

// Round-tripping is the property the duty-generation loop depends on: it walks
// a Date day by day and writes each one back as a start_date.
for (const iso of ['2026-01-01', '2026-08-12', '2026-12-31', '2026-02-28']) {
  assert.equal(toISODate(localDate(iso)), iso, `${iso} survives the round trip`)
}

// Walking across a month end must not skip or repeat a day.
{
  const cur = localDate('2026-08-30')
  const seen: string[] = []
  for (let i = 0; i < 4; i++) { seen.push(toISODate(cur)); cur.setDate(cur.getDate() + 1) }
  assert.deepEqual(seen, ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02'])
}

assert.equal(atTime('2026-08-12', '18:00').getDate(), 12, 'atTime stays on its own date')
assert.equal(atTime('2026-08-12', '18:00').getHours(), 18)
assert.equal(atTime('2026-08-12', '00:00').getDate(), 12, 'midnight does not roll back')

assert.match(formatDate('2026-08-12'), /12 Aug 2026/)

{
  const now = new Date(2026, 7, 12, 2, 30)   // 02:30 local, still the 12th
  assert.equal(todayISO(now), '2026-08-12', "UTC's date is not the operator's date")
}

console.log('dutyTime.check.ts — all assertions passed')
