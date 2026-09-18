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
  | 'extra_hour'

export type AllowanceUnit = 'day' | 'hour' | 'duty' | 'night'

/** Which clock overtime and early start are measured against. Ignored by the rest.
 *  'custom' reads the rule's own baselineTime. */
export type Baseline = 'duty_window' | 'driver_shift' | 'custom'

/** One row of the company's master list. */
export interface AllowanceRule {
  id: number
  code: AllowanceCode
  unit: AllowanceUnit
  baseline: Baseline
  /** "HH:MM" the rule measures against when baseline is 'custom'. */
  baselineTime?: string | null
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

/**
 * Hours included in a Monthly package before the per-hour extra rate starts.
 * Fixed rather than configurable: every Monthly contract the client runs is a
 * 12-hour day. Make it a column on duty_types the day one of them is not.
 */
export const MONTHLY_INCLUDED_HOURS = 12

/**
 * Minutes a Monthly day ran beyond its included hours, measured on the vehicle's
 * real use — closed_at minus started_at — not against the scheduled window. A
 * day that was never started or never closed has no measured use, so it charges
 * nothing rather than guessing from the plan.
 */
export function extraHourMins(duty: DutyFacts): number {
  if (!duty.startedAt || !duty.closedAt) return 0
  const ran = (new Date(duty.closedAt).getTime() - new Date(duty.startedAt).getTime()) / 60_000
  return Math.round(ran) - MONTHLY_INCLUDED_HOURS * 60
}

/**
 * Which clock a line is measured against, with the fallbacks applied once.
 * `shift` and `scheduled` are the duty's own end/start or report/shift pair,
 * so this serves both overtime and early start.
 */
function resolveBaseline(
  baseline: Baseline,
  custom: string | null,
  shift: string | null,
  scheduled: string | null,
): string | null {
  if (baseline === 'custom') return custom || scheduled
  if (baseline === 'driver_shift') return shift || scheduled
  return scheduled
}

/** Minutes the duty ran past the time it was due to end. Exported because the
 *  duty slip prints the observed fact behind an overtime line. */
export function overtimeMins(
  duty: DutyFacts, baseline: Baseline, baselineTime: string | null = null,
): number {
  if (!duty.closedAt) return 0
  // Both non-default baselines fall back to the duty window when the time they
  // need is missing — a driver with no shift recorded, or a custom baseline
  // nobody set a time on. An allowance that silently pays nothing is worse than
  // one that measures against the booking.
  const time = resolveBaseline(baseline, baselineTime, duty.driverShiftEnd, duty.estDropTime)
  if (!time) return 0
  const due = atTime(duty.endDate, time)
  return Math.round((new Date(duty.closedAt).getTime() - due.getTime()) / 60_000)
}

/** Minutes the driver started before they were due to report. Exported for the
 *  same reason as overtimeMins. */
export function earlyStartMins(
  duty: DutyFacts, baseline: Baseline, baselineTime: string | null = null,
): number {
  if (!duty.startedAt) return 0
  const time = resolveBaseline(baseline, baselineTime, duty.driverShiftStart, duty.reportingTime)
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
      return ceilHours(overtimeMins(duty, rule.baseline, rule.baselineTime ?? null))
    case 'extra_hour':
      // Monthly only, and one duty is one day (see dutyWindows.ts), so this
      // fires per day of the month exactly as the contract reads.
      return duty.category === 'Monthly' ? ceilHours(extraHourMins(duty)) : 0
    case 'early_start':
      return ceilHours(earlyStartMins(duty, rule.baseline, rule.baselineTime ?? null))
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
