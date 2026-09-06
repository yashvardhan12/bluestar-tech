/**
 * node --experimental-strip-types src/lib/dutyClose.check.ts
 *
 * The close path decides what gets billed, so the cases that cost money are the
 * ones checked: the planned-window default that keeps overtime at zero, the
 * forward-odometer guard, and never overwriting what the driver captured.
 */

import assert from 'node:assert/strict'
import {
  buildClosePayload, canClose, captureState, closeDefaults, isCloseable,
  effectiveStartOdo, hasErrors, validateClose,
  type DutyCaptureFacts,
} from './dutyClose.ts'

const base: DutyCaptureFacts = {
  status: 'On-Going',
  startDate: '2026-08-23',
  endDate: '2026-08-23',
  reportingTime: '07:00:00',
  estDropTime: '19:00:00',
  startedAt: null,
  startOdo: null,
  closedAt: null,
  endOdo: null,
  noShowReason: null,
}

// ── arrival states ─────────────────────────────────────────────────────────
assert.equal(captureState(base), 'blank')
assert.equal(captureState({ ...base, startedAt: '2026-08-23T01:34:00Z' }), 'started')
assert.equal(captureState({ ...base, closedAt: '2026-08-23T13:30:00Z' }), 'closed')
assert.equal(captureState({ ...base, noShowReason: 'Passenger cancelled' }), 'no-show')

// ── who may be closed ──────────────────────────────────────────────────────
assert.equal(canClose(base), true, 'blank duty is closable')
assert.equal(canClose({ ...base, startedAt: '2026-08-23T01:34:00Z' }), true, 'started duty is closable')
assert.equal(canClose({ ...base, closedAt: '2026-08-23T13:30:00Z' }), false, 'closed duty is not')
assert.equal(canClose({ ...base, noShowReason: 'no show' }), false, 'no-show is already closed')
assert.equal(canClose({ ...base, status: 'Billed' }), false, 'billed is off limits')
assert.equal(canClose({ ...base, status: 'Cancelled' }), false, 'cancelled never ran')

// Since 036 a back-dated allotment reads 'Needs closing' through duties_status.
assert.equal(canClose({ ...base, status: 'Needs closing' }), true, 'the whole point of the status')
assert.equal(isCloseable('Needs closing', null), true)

// The raw column still says Completed on those rows, and BookingDetailPage and
// the driver RPCs read it directly. Gating on status would hide the action from
// exactly the rows that need it, so the rule stays on closed_at.
assert.equal(canClose({ ...base, status: 'Completed' }), true, 'Completed-by-date with no closed_at stays closable')

// An allotted duty that has not started is closable — same rule, and the row
// menus on All Duties and Booking Detail spread it in.
assert.equal(canClose({ ...base, status: 'Allotted' }), true, 'allotted, not yet run, still closable')
assert.equal(isCloseable('Allotted', null), true)

// The row-level gate the duty lists use, from the two columns a list row has.
// Same rule as canClose, so a menu can never offer what the modal refuses.
assert.equal(isCloseable('On-Going', null), true)
assert.equal(isCloseable('Completed', null), true, 'reads Completed, empty slip — still needs closing')
assert.equal(isCloseable('Completed', '2026-08-23T13:30:00Z'), false)
assert.equal(isCloseable('Billed', null), false)
assert.equal(isCloseable('Cancelled', null), false)

// ── defaults come from the booking, never from now() ────────────────────────
{
  const d = closeDefaults(base)
  assert.equal(d.startTime, '07:00')
  assert.equal(d.closeTime, '19:00')
  assert.equal(d.closeDate, '2026-08-23')

  // The 550-hour bug: closing on a later day must not be the default.
  const payload = buildClosePayload(base, d, 'user-1', new Date('2026-09-15T10:00:00Z'))
  const ranMins = (new Date(payload.closed_at).getTime() - new Date(payload.started_at).getTime()) / 60000
  assert.equal(ranMins, 720, 'defaults reproduce the planned 12-hour window, not the wall clock')
}

// A duty with no planned times asks rather than inventing midnight.
{
  const d = closeDefaults({ ...base, reportingTime: null, estDropTime: null })
  assert.equal(d.startTime, '')
  assert.equal(d.closeTime, '')
  const e = validateClose({ ...base, reportingTime: null, estDropTime: null }, d)
  assert.ok(e.startTime && e.closeTime, 'missing times are asked for, not defaulted to 00:00')
}

// ── the forward-odometer guard ─────────────────────────────────────────────
{
  const d = { ...closeDefaults(base), startOdo: '45120', endOdo: '45090' }
  const e = validateClose(base, d)
  assert.match(e.endOdo ?? '', /45,120/, 'the error names the reading it must beat')

  assert.equal(hasErrors(validateClose(base, { ...d, endOdo: '45262' })), false, 'a forward pair passes')
  assert.ok(validateClose(base, { ...d, endOdo: '45120' }).endOdo, 'equal readings are rejected too')
}

// Against a reading the driver captured, not one in the form.
{
  const started: DutyCaptureFacts = { ...base, startedAt: '2026-08-21T01:34:00Z', startOdo: 45120 }
  const d = { ...closeDefaults(started), endOdo: '45090' }
  assert.equal(effectiveStartOdo(started, d), 45120)
  assert.ok(validateClose(started, d).endOdo, 'compares against the locked driver reading')
}

// ── readings are optional (FR-59), and "not known" is not "zero" ────────────
{
  const d = { ...closeDefaults(base), startOdoUnknown: true, endOdoUnknown: true }
  assert.equal(hasErrors(validateClose(base, d)), false, 'closing with no readings is permitted')
  const p = buildClosePayload(base, d, 'user-1')
  assert.equal(p.end_odo, null, 'unknown is null, never 0')
  assert.equal(p.start_odo, null)
}

// A blank odometer that is not marked unknown is an unfinished form.
assert.ok(
  validateClose(base, { ...closeDefaults(base), startOdo: '12.5' }).startOdo,
  'fractional readings are rejected',
)

// ── closing never overwrites the driver ────────────────────────────────────
{
  const started: DutyCaptureFacts = { ...base, startedAt: '2026-08-23T01:34:00Z', startOdo: 45120 }
  const p = buildClosePayload(started, { ...closeDefaults(started), endOdo: '45262' }, 'user-1')
  assert.equal('started_at' in p, false, 'driver start timestamp is left alone')
  assert.equal('start_odo' in p, false, 'driver start reading is left alone')
  assert.equal(p.end_odo, 45262)
  assert.equal(p.closed_by_profile, 'user-1')
}

// ── a duty cannot end before it began ──────────────────────────────────────
{
  const d = { ...closeDefaults(base), closeDate: '2026-08-22' }
  assert.ok(validateClose(base, d).closeTime, 'end before start is caught')
}

// Multi-day duties are ordinary, not errors.
{
  const multi: DutyCaptureFacts = { ...base, endDate: '2026-08-25' }
  assert.equal(hasErrors(validateClose(multi, { ...closeDefaults(multi), startOdo: '1', endOdo: '2' })), false)
}

console.log('dutyClose.check.ts — all assertions passed')

// ── distance without an odometer pair ──────────────────────────────────────
{
  const draft = { ...closeDefaults(base), startOdoUnknown: true, endOdoUnknown: true, totalKm: '142' }
  assert.equal(hasErrors(validateClose(base, draft)), false, 'a typed distance needs no readings')
  assert.equal(buildClosePayload(base, draft, null).total_km, 142)
  assert.equal(buildClosePayload(base, draft, null).end_odo, null)

  // Blank stays blank — never 0, same rule as the readings.
  assert.equal(buildClosePayload(base, closeDefaults(base), null).total_km, null)

  // Fractions are not kilometres here.
  assert.equal(validateClose(base, { ...draft, totalKm: '0' }).totalKm != null, true)

  // A distance that contradicts the readings is refused rather than silently
  // losing to them: 45120 → 45262 is 142, not 150.
  const both = { ...closeDefaults(base), startOdo: '45120', endOdo: '45262', totalKm: '150' }
  assert.equal(validateClose(base, both).totalKm != null, true, 'mismatch is named, not swallowed')
  assert.equal(hasErrors(validateClose(base, { ...both, totalKm: '142' })), false, 'agreeing is fine')
  assert.equal(hasErrors(validateClose(base, { ...both, totalKm: '' })), false, 'readings alone are fine')
}
