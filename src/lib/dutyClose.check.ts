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

// A back-dated allotment reads Completed through duties_status but has an empty
// slip. Gating on status would hide the action from exactly these rows.
assert.equal(canClose({ ...base, status: 'Completed' }), true, 'Completed-by-date with no closed_at stays closable')

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
