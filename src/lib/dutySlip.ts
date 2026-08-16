// Duty slip totals. Pure functions, no React, no Supabase — so the arithmetic
// can be checked without a browser (see dutySlip.check.ts).
//
// "Extra" is what gets billed past the package, so it is null — never 0 —
// when the package is unknown. A duty type with no threshold_km must print
// "—", because "0" reads as "nothing extra to bill" and that is a claim the
// data does not support.

// Explicit .ts extension (tsconfig has allowImportingTsExtensions) so that
// dutySlip.check.ts can run this module straight through node.
import { atTime } from './dutyTime.ts'

export interface SlipTotal {
  /** Distance run, or minutes run. Null when the duty was never closed. */
  total: number | null
  /** Past the package. Null when the package is unknown. */
  extra: number | null
}

/** Minutes → "HH:MM", the format the slip prints. Hours are not capped at 24:
 *  a multi-day duty legitimately runs 36:00. */
export function hhmm(mins: number | null): string {
  if (mins == null) return '—'
  const m = Math.max(0, Math.round(mins))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function kmTotals(
  startOdo: number | null,
  endOdo: number | null,
  thresholdKm: number | null,
): SlipTotal {
  if (startOdo == null || endOdo == null) return { total: null, extra: null }
  const total = Math.max(0, endOdo - startOdo)
  return { total, extra: thresholdKm == null ? null : Math.max(0, total - thresholdKm) }
}

/**
 * The package the customer bought, in minutes: reporting time on the start
 * date through est drop time on the end date. duty_types carries hourly rate
 * bands but no package length, so the duty's own planned window is the only
 * thing that says how long the customer paid for.
 */
export function packageMins(
  startDate: string,
  reportingTime: string | null,
  endDate: string | null,
  estDropTime: string | null,
): number | null {
  if (!reportingTime || !estDropTime) return null
  const from = atTime(startDate, reportingTime)
  const to = atTime(endDate || startDate, estDropTime)
  const mins = Math.round((to.getTime() - from.getTime()) / 60000)
  return mins > 0 ? mins : null
}

export function timeTotals(
  startedAt: string | null,
  closedAt: string | null,
  pkgMins: number | null,
): SlipTotal {
  if (!startedAt || !closedAt) return { total: null, extra: null }
  const total = Math.max(0, Math.round((new Date(closedAt).getTime() - new Date(startedAt).getTime()) / 60000))
  return { total, extra: pkgMins == null ? null : Math.max(0, total - pkgMins) }
}
