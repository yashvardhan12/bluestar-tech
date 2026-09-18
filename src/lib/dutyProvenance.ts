/**
 * Who put this figure here, and can it be believed — the pure half.
 *
 * Every captured number on a duty slip has a provenance, and until now the
 * drawer rendered all of them identically: a duty a driver photographed in the
 * car looked exactly like one an operator typed from memory three weeks later.
 * That second kind is what produced the ~550-hour overtime duty (due 25 Jul,
 * closed 17 Aug) — the figure was never wrong-looking, just unbacked.
 *
 * The columns already tell the story; nothing here is new data:
 *
 *   closed_by_profile   null when the driver closed it, the operator's id when
 *                       `buildClosePayload` wrote it
 *   corrected_at        when the entry was *made*, which is not when the duty ran
 *   *_odo_photo         a path when the driver photographed the odometer
 *   signature_path      a path when the passenger signed
 *
 * No Supabase, no React, so `dutyProvenance.check.ts` runs it straight through
 * node — same split as `dutyClose.ts` / `dutySlipPrint.ts`.
 */

/** How far `corrected_at` may sit from `closed_at` before the gap is worth
 *  saying out loud. A close typed the same day, or the next morning, is the
 *  normal operator workflow while the driver app is still rolling out —
 *  warning about it would train people to ignore the warning.
 *
 *  ponytail: one constant, not a setting. Make it a company preference only if
 *  somebody actually disagrees with 48 hours. */
export const LATE_ENTRY_HOURS = 48

export interface ProvenanceFacts {
  /** `duties.closed_by_profile` — null when the driver's own close wrote it. */
  closedByProfile: string | null
  /** `duties.corrected_at` — when the operator made the entry. */
  correctedAt: string | null
  closedAt: string | null
  startOdoPhoto: string | null
  endOdoPhoto: string | null
  signaturePath: string | null
}

/** What one captured figure is backed by. */
export type Backing = 'photographed' | 'driver' | 'typed' | 'missing'

export interface Mark {
  backing: Backing
  /** The glyph the row shows beside the number. */
  label: string
}

const MARK: Record<Backing, string> = {
  photographed: 'photo',
  driver:       'driver',
  typed:        'typed',
  missing:      '—',
}

const mark = (backing: Backing): Mark => ({ backing, label: MARK[backing] })

/** True when the operator's close wrote this duty rather than the driver's. */
export function isOperatorEntered(f: ProvenanceFacts): boolean {
  return f.closedByProfile != null
}

/**
 * The two odometer readings.
 *
 * A photo is the strongest backing there is, and it is per-reading: a duty the
 * driver started in the app and an operator finished has a photographed opening
 * and a typed closing, and the row must be able to say so.
 */
export function odoMarks(f: ProvenanceFacts, startOdo: number | null, endOdo: number | null): {
  start: Mark; end: Mark
} {
  return {
    start: odoMark(startOdo, f.startOdoPhoto, f),
    end:   odoMark(endOdo, f.endOdoPhoto, f),
  }
}

function odoMark(value: number | null, photo: string | null, f: ProvenanceFacts): Mark {
  if (value == null) return mark('missing')
  if (photo) return mark('photographed')
  return mark(isOperatorEntered(f) ? 'typed' : 'driver')
}

/**
 * The two timestamps. No photograph ever backs a time — the app records it when
 * the driver taps, so the honest distinction is only driver-observed versus
 * operator-stated.
 */
export function timeMarks(f: ProvenanceFacts, startedAt: string | null, closedAt: string | null): {
  start: Mark; end: Mark
} {
  const one = (v: string | null) =>
    v == null ? mark('missing') : mark(isOperatorEntered(f) ? 'typed' : 'driver')
  return { start: one(startedAt), end: one(closedAt) }
}

/** Hours between the duty ending and somebody typing it in. Null when the
 *  driver closed it, or when either timestamp is missing. */
export function entryLagHours(f: ProvenanceFacts): number | null {
  if (!isOperatorEntered(f) || !f.correctedAt || !f.closedAt) return null
  const ms = new Date(f.correctedAt).getTime() - new Date(f.closedAt).getTime()
  return ms <= 0 ? 0 : ms / 3_600_000
}

export interface LateEntry {
  days: number
  /** Whole sentence, so the caller never assembles one from parts. */
  sentence: string
}

/**
 * The warning, or nothing.
 *
 * Earned only by an operator entry made well after the duty it describes.
 * A same-day operator close still shows `typed` marks on every figure — the
 * absence of a photograph is visible either way — but gets no warning, because
 * it is the normal path today and a warning that fires constantly is furniture.
 */
export function lateEntry(f: ProvenanceFacts, operatorName?: string | null): LateEntry | null {
  const hours = entryLagHours(f)
  if (hours == null || hours < LATE_ENTRY_HOURS) return null

  const days = Math.round(hours / 24)
  const who = operatorName ? ` by ${operatorName}` : ''
  const when = formatDay(f.correctedAt!)
  return {
    days,
    sentence: `Entered${who} on ${when} — ${days} ${days === 1 ? 'day' : 'days'} after the duty ran.`,
  }
}

/** What the slip says under the signature, whichever way the duty was closed. */
export function signatureNote(f: ProvenanceFacts): string {
  if (f.signaturePath) return 'Captured at close · driver app'
  return isOperatorEntered(f)
    ? 'Not captured — closed by the operator'
    : 'Not captured'
}

/** "15/09/2026". Local, like every other date the slip prints. */
function formatDay(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}
