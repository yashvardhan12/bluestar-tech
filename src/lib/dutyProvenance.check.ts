// node --experimental-strip-types src/lib/dutyProvenance.check.ts
//
// The rule this file exists to hold shut: a figure a driver photographed and a
// figure an operator typed must never produce the same mark. Every assertion
// below is a pair that used to render identically in the drawer.

process.env.TZ = 'Asia/Kolkata'

import assert from 'node:assert'
import {
  odoMarks, timeMarks, entryLagHours, lateEntry, signatureNote, isOperatorEntered,
  LATE_ENTRY_HOURS, type ProvenanceFacts,
} from './dutyProvenance.ts'

/** Duty 15 as production actually holds it: closed by the driver, both odometer
 *  photographs present, signed. */
const driver: ProvenanceFacts = {
  closedByProfile: null,
  correctedAt: null,
  closedAt: '2026-08-31T13:32:08.244Z',
  startOdoPhoto: '1/duty-slips/15-start-odo-1788169964088.jpg',
  endOdoPhoto:   '1/duty-slips/15-end-odo-1788183125894.jpg',
  signaturePath: '1/duty-slips/15-signature-1788183125455.png',
}

/** The same duty closed from the operator's desk the following morning —
 *  `buildClosePayload` writes closed_by_profile and corrected_at, and no media. */
const sameDay: ProvenanceFacts = {
  closedByProfile: 'a1b2c3d4-0000-0000-0000-000000000001',
  correctedAt: '2026-09-01T04:00:00.000Z',
  closedAt: '2026-08-31T13:32:08.244Z',
  startOdoPhoto: null,
  endOdoPhoto: null,
  signaturePath: null,
}

/** The shape of the ~550-hour duty: due 25 Jul, typed 17 Aug. */
const backDated: ProvenanceFacts = {
  ...sameDay,
  closedAt: '2026-07-25T13:30:00.000Z',
  correctedAt: '2026-08-17T10:00:00.000Z',
}

// ── who wrote it ────────────────────────────────────────────────────────────
assert.equal(isOperatorEntered(driver), false)
assert.equal(isOperatorEntered(sameDay), true)

// ── the pair that used to look identical ────────────────────────────────────
{
  const a = odoMarks(driver,  113553, 113602)
  const b = odoMarks(sameDay, 113553, 113602)
  assert.equal(a.start.backing, 'photographed')
  assert.equal(a.end.backing,   'photographed')
  assert.equal(b.start.backing, 'typed')
  assert.equal(b.end.backing,   'typed')
  assert.notEqual(a.start.label, b.start.label, 'same number, different backing, different mark')
}

// A duty the driver started in the app and an operator finished: the opening is
// photographed and the closing is not, and the row has to say both.
{
  const split: ProvenanceFacts = { ...sameDay, startOdoPhoto: driver.startOdoPhoto }
  const m = odoMarks(split, 113553, 113602)
  assert.equal(m.start.backing, 'photographed')
  assert.equal(m.end.backing,   'typed')
}

// A reading nobody recorded is missing, not typed — total_km was the way out.
{
  const m = odoMarks(sameDay, null, null)
  assert.equal(m.start.backing, 'missing')
  assert.equal(m.end.backing,   'missing')
}

// ── timestamps: no photograph ever backs one ────────────────────────────────
{
  const a = timeMarks(driver,  driver.closedAt, driver.closedAt)
  const b = timeMarks(sameDay, sameDay.closedAt, sameDay.closedAt)
  assert.equal(a.start.backing, 'driver', 'observed by the app, never photographed')
  assert.equal(b.start.backing, 'typed')
  assert.equal(timeMarks(driver, null, null).start.backing, 'missing')
}

// ── the lag, which is the whole trust signal ────────────────────────────────
assert.equal(entryLagHours(driver), null, 'a driver close has no entry lag')
assert.ok(Math.abs(entryLagHours(sameDay)! - 14.46) < 0.1, 'closed 19:02, typed 09:30 next day')
assert.ok(entryLagHours(backDated)! > 500)

// Never negative: an operator may date the close later than the moment of entry.
{
  const future: ProvenanceFacts = { ...sameDay, closedAt: '2026-09-02T00:00:00.000Z' }
  assert.equal(entryLagHours(future), 0)
}

// ── the warning is earned, not automatic ────────────────────────────────────
assert.equal(lateEntry(driver), null, 'a driver close is never warned about')
assert.equal(lateEntry(sameDay), null, 'the normal operator path is not nagged')
{
  const w = lateEntry(backDated, 'Yash')
  assert.ok(w, 'a three-week-old entry is worth saying out loud')
  assert.equal(w!.days, 23)
  assert.match(w!.sentence, /Entered by Yash on 17\/08\/2026 — 23 days after the duty ran\./)
  // Without a name it still reads as a sentence, not a fragment.
  assert.match(lateEntry(backDated)!.sentence, /^Entered on /)
}

// The boundary itself, so the constant cannot drift silently.
{
  const at = new Date(Date.parse(sameDay.closedAt!) + LATE_ENTRY_HOURS * 3_600_000)
  const just: ProvenanceFacts = { ...sameDay, correctedAt: at.toISOString() }
  assert.ok(lateEntry(just), `${LATE_ENTRY_HOURS}h exactly is late`)
  const under: ProvenanceFacts = { ...sameDay, correctedAt: new Date(at.getTime() - 60_000).toISOString() }
  assert.equal(lateEntry(under), null, 'a minute under is not')
}

// ── the signature line names why it is absent ───────────────────────────────
assert.match(signatureNote(driver), /Captured at close/)
assert.match(signatureNote(sameDay), /closed by the operator/)
assert.equal(signatureNote({ ...driver, signaturePath: null }), 'Not captured')

console.log('dutyProvenance.check.ts — all assertions passed')
