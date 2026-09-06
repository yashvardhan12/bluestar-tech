// node --experimental-strip-types src/lib/dutySlip.check.ts
//
// The slip is billing evidence, so the part worth pinning is the difference
// between "no extra" and "we don't know": one is billable at zero, the other
// must not print a number at all.

import assert from 'node:assert/strict'
import { hhmm, kmTotals, packageMins, timeTotals } from './dutySlip.ts'

// ── hhmm ─────────────────────────────────────────────────────────────────────
assert.equal(hhmm(0), '00:00')
assert.equal(hhmm(720), '12:00')
assert.equal(hhmm(65), '01:05')
// A two-day duty runs past 24 hours; the hour field is not a clock.
assert.equal(hhmm(36 * 60), '36:00')
assert.equal(hhmm(null), '—')

// ── km ───────────────────────────────────────────────────────────────────────
// The Figma sample: 200 → 300 against a 300km package.
assert.deepEqual(kmTotals(200, 300, 300), { total: 100, extra: 0 })
assert.deepEqual(kmTotals(200, 500, 300), { total: 300, extra: 0 })
assert.deepEqual(kmTotals(200, 501, 300), { total: 301, extra: 1 })
// No threshold on the duty type: the distance is known, the overage is not.
assert.deepEqual(kmTotals(200, 300, null), { total: 100, extra: null })
// Never closed — no reading, nothing to say.
assert.deepEqual(kmTotals(200, null, 300), { total: null, extra: null })
assert.deepEqual(kmTotals(null, 300, 300), { total: null, extra: null })

// A typed distance stands in when the pair is incomplete, and is billed the
// same way — 320 against a 300km package is 20 extra, readings or not.
assert.deepEqual(kmTotals(null, null, 300, 320), { total: 320, extra: 20 })
assert.deepEqual(kmTotals(200, null, 300, 320), { total: 320, extra: 20 })
// The readings are the evidence: they win over a figure someone typed.
assert.deepEqual(kmTotals(200, 300, 300, 999), { total: 100, extra: 0 })
// Neither → still nothing to say.
assert.deepEqual(kmTotals(null, null, 300, null), { total: null, extra: null })

// ── package window ───────────────────────────────────────────────────────────
// 04:00 → 16:00 same day is the 12h package in the design.
assert.equal(packageMins('2026-08-04', '04:00:00', '2026-08-04', '16:00:00'), 720)
// Multi-day: the end date is what stops this being negative.
assert.equal(packageMins('2026-08-04', '22:00:00', '2026-08-05', '10:00:00'), 720)
// An end date the caller left null falls back to the start date.
assert.equal(packageMins('2026-08-04', '04:00:00', null, '16:00:00'), 720)
// Half a duty's times missing → unknown, not zero.
assert.equal(packageMins('2026-08-04', null, '2026-08-04', '16:00:00'), null)
assert.equal(packageMins('2026-08-04', '04:00:00', '2026-08-04', null), null)
// Same instant both ends is not a package.
assert.equal(packageMins('2026-08-04', '04:00:00', '2026-08-04', '04:00:00'), null)

// ── time ─────────────────────────────────────────────────────────────────────
const started = '2026-08-04T04:00:00'
assert.deepEqual(timeTotals(started, '2026-08-04T16:00:00', 720), { total: 720, extra: 0 })
assert.deepEqual(timeTotals(started, '2026-08-04T17:30:00', 720), { total: 810, extra: 90 })
// Finished inside the package: extra is 0, never negative.
assert.deepEqual(timeTotals(started, '2026-08-04T10:00:00', 720), { total: 360, extra: 0 })
// Unknown package → the run is still printable, the overage is not.
assert.deepEqual(timeTotals(started, '2026-08-04T16:00:00', null), { total: 720, extra: null })
// Still open.
assert.deepEqual(timeTotals(started, null, 720), { total: null, extra: null })

console.log('dutySlip.check.ts ✓')
