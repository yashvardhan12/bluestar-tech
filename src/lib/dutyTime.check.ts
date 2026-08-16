// node --experimental-strip-types src/lib/dutyTime.check.ts
//
// The countdown is what a driver reads at 5:30am to decide whether to move, so
// the boundaries between "In 45m" and "In 1hr" are the part worth pinning.

import assert from 'node:assert/strict'
import { atTime, countdown, formatTime, departurePrompt, duration } from './dutyTime.ts'

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

console.log('dutyTime.check.ts — all assertions passed')
