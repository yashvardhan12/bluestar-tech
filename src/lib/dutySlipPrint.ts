/**
 * What the printed duty slip says, derived — the pure half.
 *
 * The sheet is one document with one frame, and exactly one row changes with
 * the duty type: the strip under the leg row, plus the notes beside the two
 * totals. That branch is decided by `duty_types.category`, the same field
 * `dutyPrice.ts` prices on, so the paper and the invoice can never disagree
 * about what carried the charge.
 *
 * No money anywhere. The reference slip carries none either: this is a record
 * of what ran and who signed for it, and the rate belongs on the invoice. A
 * figure printed here would be a second, unreconciled place for a price to live.
 *
 * No Supabase, no React, so `dutySlipPrint.check.ts` runs it straight through
 * node — same split as `dutyPrice.ts` / `allowances.ts`.
 */

import { kmTotals } from './dutySlip.ts'
import { hoursRun, isNightDuty } from './dutyPrice.ts'
import { daysSpanned, nightsSpanned, MONTHLY_INCLUDED_HOURS } from './allowances.ts'

export interface PrintFacts {
  /** duty_types.category. Null when duties.duty_type matches no rate card —
   *  free text is normal in this column, so the slip must still print. */
  category: string | null
  isAirportBooking: boolean
  toLocation: string | null
  startDate: string
  endDate: string
  reportingTime: string | null
  estDropTime: string | null
  startedAt: string | null
  closedAt: string | null
  startOdo: number | null
  endOdo: number | null
  totalKm: number | null
  thresholdKm: number | null
}

export interface StripItem { label: string; value: string }

/** "18:00:00" → "18:00"; null → "—". Postgres time columns carry seconds. */
export function hm(t: string | null): string {
  return t ? t.slice(0, 5) : '—'
}

/** Decimal hours → "3:39". hoursRun already rounds to the half hour the rate
 *  bands are sold in, so this only formats. */
export function hoursLabel(hours: number | null): string {
  if (hours == null) return '—'
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

/**
 * The two badges in the masthead. Category first, because that is what decides
 * how the duty is read; the second line qualifies it.
 */
export function badges(f: PrintFacts): { primary: string; secondary: string } {
  switch (f.category) {
    case 'Airport':
      return { primary: 'AIRPORT', secondary: f.toLocation?.toUpperCase() || 'TRANSFER' }
    case 'Outstation':
      return { primary: 'OUTSTATION', secondary: f.toLocation?.toUpperCase() || '' }
    case 'Monthly':
      return { primary: 'MONTHLY', secondary: monthLabel(f.startDate) }
    case 'Hourly':
      return { primary: 'LOCAL', secondary: f.isAirportBooking ? 'AIRPORT PICKUP' : '' }
    default:
      // No rate card matched. Say so on the paper rather than invent a category.
      return { primary: 'DUTY', secondary: '' }
  }
}

/** "2026-09-05" → "SEP 2026". */
function monthLabel(iso: string): string {
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const [y, m] = iso.split('-')
  return `${MONTHS[Number(m) - 1] ?? '—'} ${y}`
}

/**
 * The one row that differs by category — what this duty has to evidence.
 *
 * Each case names only what its own category is priced on. An Outstation strip
 * that mentioned hour bands, or an Airport strip that mentioned distance, would
 * invite an argument from a number that bills nothing.
 */
export function typeStrip(f: PrintFacts): StripItem[] {
  const km = kmTotals(f.startOdo, f.endOdo, null, f.totalKm).total
  const hours = hoursRun(f.startedAt, f.closedAt)

  switch (f.category) {
    case 'Airport':
      return [
        { label: 'Transfer', value: f.toLocation || '—' },
        { label: 'Night charge', value: isNightDuty(f.startedAt, f.closedAt) ? 'Applies' : 'Does not apply' },
        { label: 'Basis', value: 'Fixed by zone, not by run' },
      ]

    case 'Outstation': {
      const days = daysSpanned(f.startDate, f.endDate)
      const nights = nightsSpanned(f.startDate, f.endDate)
      return [
        { label: 'Days spanned', value: String(days) },
        { label: 'Nights halted', value: String(nights) },
        { label: 'Distance run', value: km == null ? '—' : `${km} km` },
      ]
    }

    case 'Monthly': {
      // Only the excess over the included hours is chargeable, and it reaches
      // the invoice as the Extra hours allowance, never as car hire.
      const extra = hours == null ? null : Math.max(0, hours - MONTHLY_INCLUDED_HOURS)
      return [
        { label: 'Package', value: monthLabel(f.startDate) },
        { label: 'Included', value: `${MONTHLY_INCLUDED_HOURS} hrs per day` },
        { label: 'Excess', value: extra == null ? '—' : extra === 0 ? 'None' : `${hoursLabel(extra)} chargeable` },
      ]
    }

    case 'Hourly':
      return [
        { label: 'Package window', value: `${hm(f.reportingTime)} – ${hm(f.estDropTime)}` },
        { label: 'Distance threshold', value: f.thresholdKm == null ? '—' : `${f.thresholdKm} km` },
        { label: 'Ran', value: ranLabel(km, f.thresholdKm) },
      ]

    default:
      return [{ label: 'Duty type', value: 'No rate card matched — nothing to bill from' }]
  }
}

/** Which side of the threshold the duty fell, which is what decides whether an
 *  Hourly duty bills on hour bands or on distance. */
function ranLabel(km: number | null, thresholdKm: number | null): string {
  if (km == null) return '—'
  if (thresholdKm == null) return `${km} km`
  return km >= thresholdKm ? `${km} km — over threshold` : `${km} km — under threshold`
}

/**
 * Notes printed beside Total K.M and Total Hrs.
 *
 * `airportLines()` reads neither figure, so both are marked record only —
 * they are evidence the journey happened, not the basis of the charge.
 * Monthly's hours are read against the included allowance, and its distance
 * runs against a monthly pool rather than this duty.
 */
export function totalNotes(f: PrintFacts): { km: string | null; hrs: string | null } {
  switch (f.category) {
    case 'Airport':
      return { km: 'record only', hrs: 'record only' }
    case 'Monthly': {
      const hours = hoursRun(f.startedAt, f.closedAt)
      const extra = hours == null ? null : Math.max(0, hours - MONTHLY_INCLUDED_HOURS)
      return {
        km: 'against monthly pool',
        hrs: extra == null ? null : `${MONTHLY_INCLUDED_HOURS} incl · ${hoursLabel(extra)} extra`,
      }
    }
    default:
      return { km: null, hrs: null }
  }
}

/** The leg row and the two totals, formatted. `—` throughout for a duty that
 *  was never closed: the slip prints, and the empty cells are the point. */
export function legRow(f: PrintFacts): {
  rep: string; open: string; rel: string; close: string
  totalKm: string; totalHrs: string; combined: string
} {
  const km = kmTotals(f.startOdo, f.endOdo, null, f.totalKm).total
  const hours = hoursRun(f.startedAt, f.closedAt)
  const totalKm = km == null ? '—' : String(km)
  const totalHrs = hoursLabel(hours)

  return {
    rep:      stamp(f.startedAt),
    open:     f.startOdo == null ? '—' : String(f.startOdo),
    rel:      stamp(f.closedAt),
    close:    f.endOdo == null ? '—' : String(f.endOdo),
    totalKm,
    totalHrs,
    combined: `${totalKm} / ${totalHrs}`,
  }
}

/** A timestamp as the leg row prints it: "31/08 15:22", local clock. */
function stamp(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm} ${hh}:${mi}`
}

/** "31/08/2026  07:00   TO   31/08/2026  23:59" — the planned window, which is
 *  what the customer booked, never the observed one. */
export function plannedWindow(f: PrintFacts): string {
  return `${dmy(f.startDate)}  ${hm(f.reportingTime)}   TO   ${dmy(f.endDate)}  ${hm(f.estDropTime)}`
}

export function dmy(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
