// Allowance arithmetic. Pure functions, no React, no Supabase — so the money
// can be checked without a browser (see allowances.check.ts).
//
// The whole feature rests on one rule: the quantity is computed once per duty
// per allowance, then priced twice. The driver rate is company-wide and applies
// whenever the trigger fires. The customer rate exists only where the operator
// added that allowance to the duty type — so an allowance can pay the driver
// and never reach an invoice, which is the normal case for off-day and night.

// Explicit .ts extensions (tsconfig has allowImportingTsExtensions) so that
// allowances.check.ts can run this module straight through node.
import { round2 } from './money.ts'
import { atTime } from './dutyTime.ts'

export type AllowanceCode =
  | 'daily' | 'overtime' | 'outstation' | 'outstation_overnight'
  | 'off_day' | 'early_start' | 'night' | 'extra_duty' | 'airport'

export type AllowanceUnit = 'day' | 'hour' | 'duty' | 'night'

/** Which clock overtime and early start are measured against. Ignored by the rest. */
export type Baseline = 'duty_window' | 'driver_shift'

/** One row of the company's master list. */
export interface AllowanceRule {
  id: number
  code: AllowanceCode
  unit: AllowanceUnit
  baseline: Baseline
  driverRate: number | null
  isActive: boolean
}

/** Everything about a duty the triggers need, already resolved by the caller. */
export interface DutyFacts {
  status: string
  startDate: string                 // YYYY-MM-DD
  endDate: string                   // YYYY-MM-DD
  reportingTime: string | null      // HH:MM
  estDropTime: string | null        // HH:MM
  startedAt: string | null          // ISO timestamp, null until the driver starts
  closedAt: string | null           // ISO timestamp, null until the driver closes
  category: string | null           // duty_types.category
  isAirportBooking: boolean
  /** This duty's rank among the driver's own duties that calendar day, 1-based. */
  dutyIndexOfDay: number
  driverOffDay: string | null       // 'Sunday'
  driverShiftStart: string | null   // HH:MM
  driverShiftEnd: string | null     // HH:MM
}

export interface AllowanceLine {
  allowanceId: number
  code: AllowanceCode
  qty: number
  driverRate: number | null
  driverAmount: number
  customerRate: number | null
  customerAmount: number
}

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday',
]

/** Whole days since the epoch. Built in UTC so no timezone or DST shift can
 *  move a date across a boundary and change a day count. */
function dayNumber(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

export function weekdayName(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/** Both ends count: 10 to 12 August is three days. */
export function daysSpanned(startDate: string, endDate: string): number {
  return Math.max(1, dayNumber(endDate) - dayNumber(startDate) + 1)
}

/** Midnights crossed: 10 to 12 August is two nights. */
export function nightsSpanned(startDate: string, endDate: string): number {
  return Math.max(0, dayNumber(endDate) - dayNumber(startDate))
}

/** Any part of an hour is a whole hour, with no grace period. Zero or negative
 *  minutes produce no hours at all rather than a deduction. */
export function ceilHours(mins: number): number {
  return mins <= 0 ? 0 : Math.ceil(mins / 60)
}

/** Minutes the duty ran past the time it was due to end. Exported because the
 *  duty slip prints the observed fact behind an overtime line. */
export function overtimeMins(duty: DutyFacts, baseline: Baseline): number {
  if (!duty.closedAt) return 0
  // driver_shift falls back to the duty window whenever the driver has no shift
  // recorded — otherwise the allowance silently pays nothing, and every driver
  // in production currently has these blank.
  const time = baseline === 'driver_shift' && duty.driverShiftEnd
    ? duty.driverShiftEnd
    : duty.estDropTime
  if (!time) return 0
  const due = atTime(duty.endDate, time)
  return Math.round((new Date(duty.closedAt).getTime() - due.getTime()) / 60_000)
}

/** Minutes the driver started before they were due to report. Exported for the
 *  same reason as overtimeMins. */
export function earlyStartMins(duty: DutyFacts, baseline: Baseline): number {
  if (!duty.startedAt) return 0
  const time = baseline === 'driver_shift' && duty.driverShiftStart
    ? duty.driverShiftStart
    : duty.reportingTime
  if (!time) return 0
  const due = atTime(duty.startDate, time)
  return Math.round((due.getTime() - new Date(duty.startedAt).getTime()) / 60_000)
}

/** How many units of this allowance the duty earned. Zero means it never fired. */
export function quantityFor(rule: AllowanceRule, duty: DutyFacts): number {
  const outstation = duty.category === 'Outstation'
  switch (rule.code) {
    case 'daily':
      return daysSpanned(duty.startDate, duty.endDate)
    case 'outstation':
      return outstation ? daysSpanned(duty.startDate, duty.endDate) : 0
    case 'night':
      return nightsSpanned(duty.startDate, duty.endDate)
    case 'outstation_overnight':
      // Deliberately stacks with night: overnight covers lodging, night covers
      // the extended hours. Confirmed with the client.
      return outstation ? nightsSpanned(duty.startDate, duty.endDate) : 0
    case 'overtime':
      return ceilHours(overtimeMins(duty, rule.baseline))
    case 'early_start':
      return ceilHours(earlyStartMins(duty, rule.baseline))
    case 'off_day':
      return duty.driverOffDay && weekdayName(duty.startDate) === duty.driverOffDay ? 1 : 0
    case 'extra_duty':
      // One per duty after the driver's first that day, so three duties on a
      // Tuesday produce two allowances in total, not one.
      return duty.dutyIndexOfDay > 1 ? 1 : 0
    case 'airport':
      return duty.category === 'Airport' || duty.isAirportBooking ? 1 : 0
  }
}

/**
 * The lines a duty earns. `customerRates` maps allowance id → the price set on
 * this duty's type; an allowance missing from it pays the driver and is never
 * billed. Allowances that did not fire are left out entirely rather than
 * stored as zeroes.
 */
export function computeAllowances(
  duty: DutyFacts,
  rules: AllowanceRule[],
  customerRates: Record<number, number>,
): AllowanceLine[] {
  // A cancelled duty earns nothing on either side, however late it was called off.
  if (duty.status === 'Cancelled') return []

  const lines: AllowanceLine[] = []
  for (const rule of rules) {
    if (!rule.isActive) continue
    const qty = quantityFor(rule, duty)
    if (qty <= 0) continue

    const customerRate = customerRates[rule.id] ?? null
    lines.push({
      allowanceId:    rule.id,
      code:           rule.code,
      qty,
      driverRate:     rule.driverRate,
      driverAmount:   round2(qty * (rule.driverRate ?? 0)),
      customerRate,
      customerAmount: round2(qty * (customerRate ?? 0)),
    })
  }
  return lines
}

export function driverTotal(lines: AllowanceLine[]): number {
  return round2(lines.reduce((sum, l) => sum + l.driverAmount, 0))
}

export function customerTotal(lines: AllowanceLine[]): number {
  return round2(lines.reduce((sum, l) => sum + l.customerAmount, 0))
}
