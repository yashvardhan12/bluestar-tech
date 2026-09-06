/**
 * Operator-side duty closure — the pure half.
 *
 * FR-59. Everything that decides *whether* a duty can be closed, what the form
 * should be pre-filled with, and whether what the operator typed is coherent.
 * No Supabase, no React, so `dutyClose.check.ts` can run it straight through
 * node — same split as `allowances.ts` / `dutyAllowances.ts`.
 *
 * The premise: `closed_at`, `end_odo` and the evidence columns have exactly one
 * writer today, `driver_close_duty`, gated on `current_driver_id()`. The driver
 * app is still being rolled out, but even once every driver is on it the
 * operator keeps an unconditional path to close — a duty that cannot be closed
 * cannot be billed, and that must never depend on someone else's phone.
 */

import { atTime } from './dutyTime.ts'

export interface DutyCaptureFacts {
  /** Effective status is fine here: the view passes Billed/Cancelled through. */
  status: string
  startDate: string
  endDate: string
  reportingTime: string | null
  estDropTime: string | null
  startedAt: string | null
  startOdo: number | null
  closedAt: string | null
  endOdo: number | null
  noShowReason: string | null
}

/** Which of the eight arrival states this row is in, collapsed to what changes
 *  the form. Pickup and expenses alter nothing about what is missing. */
export type CaptureState = 'blank' | 'started' | 'closed' | 'no-show'

export function captureState(d: DutyCaptureFacts): CaptureState {
  if (d.noShowReason) return 'no-show'
  if (d.closedAt) return 'closed'
  if (d.startedAt) return 'started'
  return 'blank'
}

/**
 * Gated on `closed_at`, never on status.
 *
 * A back-dated allotment carries an empty slip while its stored status reads
 * `Completed`; gating on status would hide the action from exactly the rows
 * that need it. `duties_status` now derives `Needs closing` for them (036), but
 * the raw column is what BookingDetailPage and the driver RPCs see. A closed duty is out of scope on purpose — changing a
 * figure there is FR-56 correction, which belongs on the duty slip beside the
 * evidence.
 */
export function isCloseable(status: string, closedAt: string | null): boolean {
  if (status === 'Billed' || status === 'Cancelled') return false
  return closedAt == null
}

export function canClose(d: DutyCaptureFacts): boolean {
  // no_show_reason always arrives with a closed_at from driver_mark_no_show, so
  // this is belt and braces rather than a second rule.
  return isCloseable(d.status, d.closedAt) && d.noShowReason == null
}

export interface CloseDraft {
  startDate: string
  startTime: string
  startOdo: string
  startOdoUnknown: boolean
  closeDate: string
  closeTime: string
  endOdo: string
  endOdoUnknown: boolean
  /** Distance run, typed straight in. The way out for a duty whose readings
   *  nobody wrote down — the operator has the total off the paper slip. */
  totalKm: string
}

/** "HH:MM:SS" → "HH:MM"; null → "". */
function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : ''
}

/**
 * Pre-fill from the duty's own planned window — never `now()`.
 *
 * A production duty due to drop 25 Jul 2026 was closed 17 Aug 2026, which
 * computes to roughly 550 hours of overtime. Defaulting to the planned window
 * makes overtime resolve to exactly 0: the neutral answer. Overtime becomes
 * billable only when an operator deliberately types a later time.
 *
 * A missing reporting or drop time defaults to empty rather than to midnight.
 * We genuinely do not know it, and validation asks — a silent 00:00 would
 * invent a twelve-hour duty.
 */
export function closeDefaults(d: DutyCaptureFacts): CloseDraft {
  return {
    startDate:       d.startDate,
    startTime:       hhmm(d.reportingTime),
    startOdo:        '',
    startOdoUnknown: false,
    closeDate:       d.endDate,
    closeTime:       hhmm(d.estDropTime),
    endOdo:          '',
    endOdoUnknown:   false,
    totalKm:         '',
  }
}

export interface CloseErrors {
  startTime?: string
  closeTime?: string
  startOdo?: string
  endOdo?: string
  totalKm?: string
}

/** Readings are optional (FR-59) but must be coherent when given. Odometers are
 *  whole kilometres — no vehicle reports a fractional reading. */
function parseOdo(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : NaN
}

/** The start reading in play: the driver's if they captured one, else the
 *  operator's draft. Used for the forward-odometer comparison. */
export function effectiveStartOdo(d: DutyCaptureFacts, draft: CloseDraft): number | null {
  if (d.startedAt) return d.startOdo
  if (draft.startOdoUnknown) return null
  const v = parseOdo(draft.startOdo)
  return v == null || Number.isNaN(v) ? null : v
}

export function validateClose(d: DutyCaptureFacts, draft: CloseDraft): CloseErrors {
  const errors: CloseErrors = {}
  const locked = d.startedAt != null

  // ── the start half, only when the driver did not already write it ────────
  if (!locked) {
    if (!draft.startTime) errors.startTime = 'Enter the time the duty started.'
    if (!draft.startOdoUnknown) {
      const v = parseOdo(draft.startOdo)
      if (Number.isNaN(v)) errors.startOdo = 'Enter a whole number of kilometres.'
    }
  }

  // ── the close half ───────────────────────────────────────────────────────
  if (!draft.closeTime) errors.closeTime = 'Enter the time the duty ended.'

  let end: number | null = null
  if (!draft.endOdoUnknown) {
    const v = parseOdo(draft.endOdo)
    if (Number.isNaN(v)) errors.endOdo = 'Enter a whole number of kilometres.'
    else end = v
  }

  // FR-29 / duties_odo_forward, checked here so Postgres never has to refuse.
  // Naming the number it must beat is what lets the operator ask the driver the
  // right follow-up question while they are still on the line.
  const start = effectiveStartOdo(d, draft)
  if (!errors.endOdo && end != null && start != null && end <= start) {
    errors.endOdo = `Must be more than the start reading of ${start.toLocaleString('en-IN')} km.`
  }

  // The distance, when the operator has it instead of the readings. Optional,
  // but it may not quietly contradict a pair that is also there — the slip can
  // only print one number, and a silent winner is how a wrong one gets billed.
  const typed = parseOdo(draft.totalKm)
  if (Number.isNaN(typed)) {
    errors.totalKm = 'Enter a whole number of kilometres.'
  } else if (typed != null && start != null && end != null && end - start !== typed) {
    errors.totalKm = `The readings give ${(end - start).toLocaleString('en-IN')} km. Clear one or the other.`
  }

  // A duty cannot end before it began. Usually a mistyped end date on a
  // multi-day duty, so the message points at the date, not the clock.
  if (!errors.startTime && !errors.closeTime) {
    const startAt = locked ? new Date(d.startedAt!) : atTime(draft.startDate, draft.startTime)
    const closeAt = atTime(draft.closeDate, draft.closeTime)
    if (closeAt.getTime() <= startAt.getTime()) {
      errors.closeTime = 'The duty must end after it started — check the date.'
    }
  }

  return errors
}

export function hasErrors(e: CloseErrors): boolean {
  return Object.keys(e).length > 0
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The row to write. Driver-captured values are never included: closing is not
 * correcting (FR-56), and if one gesture did both, no record would carry a
 * provenance worth trusting.
 */
export function buildClosePayload(
  d: DutyCaptureFacts,
  draft: CloseDraft,
  userId: string | null,
  now: Date = new Date(),
): Record<string, any> {
  const payload: Record<string, any> = {
    closed_at:         atTime(draft.closeDate, draft.closeTime).toISOString(),
    end_odo:           draft.endOdoUnknown ? null : parseOdo(draft.endOdo),
    total_km:          parseOdo(draft.totalKm),
    status:            'Completed',
    closed_by_profile: userId,
    // The one place now() is right: when the entry was made, not when it ran.
    corrected_at:      now.toISOString(),
  }
  if (!d.startedAt) {
    payload.started_at = atTime(draft.startDate, draft.startTime).toISOString()
    payload.start_odo  = draft.startOdoUnknown ? null : parseOdo(draft.startOdo)
  }
  return payload
}
/* eslint-enable @typescript-eslint/no-explicit-any */
