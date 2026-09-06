// Car-hire pricing for one duty, from the duty type rate card and what the duty
// actually ran. Pure functions, no React, no Supabase — so the money can be
// checked without a browser (see dutyPrice.check.ts).
//
// This closes the gap noted in invoice.ts: duties.base_rate is typed by hand and
// the rate card (threshold_km, rate_per_km, rate_0_6_hrs, night_charges,
// daily_outstation_charges) is dead at invoice time. Everything it needs is now
// recorded — total_km/odometer from the close, started_at/closed_at from the
// driver or the operator, tolls from driver_expenses.
//
// The rules are the client's own settlement sheet (Relation.xlsx, "RIL Duty
// Types"), which is the billing contract. Its columns map onto existing ones:
//
//   sheet                        here
//   ─────────────────────────────────────────────────────────
//   "Local" duty                 category Hourly
//   "Outdoor" duty               category Outstation
//   L/duties 0-6 / 6-12 / 12hr   rate_0_6_hrs / _6_12_ / _12_plus_
//   O/S Duty (per km)            rate_per_km
//   150 km / 200 km cut-over     threshold_km
//   D.A                          daily_outstation_charges
//   Night Charges                night_charges
//   Toll/parking                 driver_expenses of type Toll and Parking
//
// The sheet's premium types (Super Premium Sedan, Deluxe, …) bill one flat
// hourly rate instead of three bands. That needs no new column and no branch:
// put the same rate in all three bands and the band arithmetic collapses to
// hours x rate. 6r + 6r + 5r is 17r.
//
// ── one category, one relation ───────────────────────────────────────────────
//
// Each category is priced by its own function below, and none of them may read
// a field belonging to another. This is not tidiness: a duty type carries every
// column on the table whether or not its category uses one, so an Airport type
// left with a stale rate_per_km from an earlier edit is normal data. If Airport
// pricing so much as glanced at rate_per_km it would bill from a number nobody
// meant to be live.
//
//   Airport      fixed_charges, night_charges          — never hours, never km
//   Hourly       threshold_km then bands OR rate_per_km, night_charges
//   Outstation   rate_per_km, daily_outstation_charges — never night, never bands
//   Monthly      not priced here; it is a package plus extra hours
//
// dutyPrice.check.ts holds this shut: every category is priced against a card
// with all the *other* categories' fields deliberately filled in, and must
// return the same total as one with only its own.

// Explicit .ts extensions (tsconfig has allowImportingTsExtensions) so that
// dutyPrice.check.ts can run this module straight through node.
import { round2 } from './money.ts'
import { daysSpanned } from './allowances.ts'
import { kmTotals } from './dutySlip.ts'

/** The duty type's prices. Nulls are normal — an Outstation type has no bands. */
export interface RateCard {
  category: string | null
  fixedCharges: number | null
  thresholdKm: number | null
  rate0to6Hrs: number | null
  rate6to12Hrs: number | null
  rate12PlusHrs: number | null
  ratePerKm: number | null
  nightCharges: number | null
  dailyOutstationCharges: number | null
}

/** What the duty ran. Everything already resolved by the caller. */
export interface RunFacts {
  startDate: string               // YYYY-MM-DD
  endDate: string                 // YYYY-MM-DD
  startedAt: string | null        // ISO timestamp
  closedAt: string | null         // ISO timestamp
  startOdo: number | null
  endOdo: number | null
  totalKm: number | null
  /** Tolls and parking already summed. A pass-through, never marked up. */
  expenses: number
}

export interface PriceLine {
  label: string
  amount: number
}

export interface DutyPrice {
  /** Hours run to the nearest half hour, null when the duty never closed. */
  hours: number | null
  km: number | null
  /** The derivation, in the order a slip should print it. */
  lines: PriceLine[]
  total: number
}

/**
 * Hours run, to the nearest half hour.
 *
 * The sheet gets here as MROUND((release - pickup)/100, 0.5) on HHMM integers,
 * which is only approximately hours — 09:00 to 17:45 reads 8.45 there and 8.75
 * of real elapsed time. We have real timestamps, so we use them; the half-hour
 * rounding is kept because that is the granularity the rate bands are sold in.
 */
export function hoursRun(startedAt: string | null, closedAt: string | null): number | null {
  if (!startedAt || !closedAt) return null
  const mins = (new Date(closedAt).getTime() - new Date(startedAt).getTime()) / 60_000
  return mins <= 0 ? 0 : Math.round(mins / 30) / 2
}

/** The sheet's O, P and Q: hours falling in the 0-6, 6-12 and 12+ bands. */
export function hourBands(hours: number): [number, number, number] {
  return [
    Math.min(hours, 6),
    Math.min(Math.max(hours - 6, 0), 6),
    Math.max(hours - 12, 0),
  ]
}

/**
 * Whether the night charge fires — a Local-duty rule only.
 *
 * The sheet's test is pickup before 05:00 or release at/after 23:00. Its own
 * sample writes midnight as "2400", so a duty that ends just past midnight is
 * meant to be caught; on real timestamps that reads as an hour before 05:00,
 * which the third clause covers.
 *
 * Clock time is read in the browser's zone, the same assumption the rest of the
 * app makes about timestamptz.
 */
export function isNightDuty(startedAt: string | null, closedAt: string | null): boolean {
  const startHr = startedAt ? new Date(startedAt).getHours() : null
  const endHr = closedAt ? new Date(closedAt).getHours() : null
  if (startHr != null && startHr < 5) return true
  if (endHr != null && (endHr >= 23 || endHr < 5)) return true
  return false
}

/**
 * What the customer owes for the car hire, before allowances, discount and tax.
 *
 * Null means the duty cannot be priced yet, never zero — the same doctrine as
 * dutySlip.ts. A Local duty needs its hours or its distance depending on which
 * side of the threshold it falls; an Outdoor duty only ever needs distance.
 */
/**
 * Airport: a fixed charge for the transfer, plus the night charge when the
 * clock says so. Distance and duration are recorded but never priced — that is
 * the whole point of a fixed transfer rate.
 */
function airportLines(card: RateCard, run: RunFacts): PriceLine[] | null {
  if (card.fixedCharges == null) return null
  const lines: PriceLine[] = [{ label: 'Fixed charges', amount: round2(card.fixedCharges) }]
  addNight(lines, card, run)
  return lines
}

/**
 * Hourly (the sheet's "Local"): an hourly package until the duty runs far
 * enough to be billed on distance instead. The two are alternatives, never a
 * sum — past the threshold the bands drop out entirely.
 */
function hourlyLines(card: RateCard, run: RunFacts, km: number | null, hours: number | null): PriceLine[] | null {
  const lines: PriceLine[] = []
  if (km != null && card.thresholdKm != null && km >= card.thresholdKm) {
    if (card.ratePerKm == null) return null
    lines.push({ label: `${km} km @ ${card.ratePerKm}/km`, amount: round2(km * card.ratePerKm) })
  } else {
    if (hours == null) return null
    const bands = hourBands(hours)
    const rates = [card.rate0to6Hrs, card.rate6to12Hrs, card.rate12PlusHrs]
    const labels = ['0-6 hrs', '6-12 hrs', '12+ hrs']
    for (let i = 0; i < 3; i++) {
      if (bands[i] <= 0) continue
      // A band that ran but carries no rate is a hole in the rate card, not a
      // free hour. Refuse to price rather than quietly under-bill.
      if (rates[i] == null) return null
      lines.push({ label: `${bands[i]} hr @ ${rates[i]}/hr (${labels[i]})`, amount: round2(bands[i] * rates[i]!) })
    }
  }
  addNight(lines, card, run)
  return lines
}

/**
 * Outstation (the sheet's "Outdoor"): distance plus a daily allowance for every
 * day away. Priced on the road, not the clock — no hour bands, and no night
 * charge however late it ends. The sheet is explicit that night does not apply.
 */
function outstationLines(card: RateCard, run: RunFacts, km: number | null): PriceLine[] | null {
  if (km == null || card.ratePerKm == null) return null
  const lines: PriceLine[] = [
    { label: `${km} km @ ${card.ratePerKm}/km`, amount: round2(km * card.ratePerKm) },
  ]
  if (card.dailyOutstationCharges) {
    const days = daysSpanned(run.startDate, run.endDate)
    lines.push({
      label: days > 1 ? `Daily allowance x ${days}` : 'Daily allowance',
      amount: round2(days * card.dailyOutstationCharges),
    })
  }
  return lines
}

/** Shared by the two categories that charge it, and reached by no other. */
function addNight(lines: PriceLine[], card: RateCard, run: RunFacts): void {
  if (card.nightCharges && isNightDuty(run.startedAt, run.closedAt)) {
    lines.push({ label: 'Night charges', amount: round2(card.nightCharges) })
  }
}

/**
 * What the customer owes for the car hire, before allowances, discount and tax.
 *
 * Null means the duty cannot be priced yet, never zero — the same doctrine as
 * dutySlip.ts. Monthly returns null on purpose: it is a fixed package whose
 * only variable part is extra hours, which is an allowance and not priced here.
 */
export function priceDuty(card: RateCard, run: RunFacts): DutyPrice | null {
  const km = kmTotals(run.startOdo, run.endOdo, null, run.totalKm).total
  const hours = hoursRun(run.startedAt, run.closedAt)

  let lines: PriceLine[] | null
  switch (card.category) {
    case 'Airport':    lines = airportLines(card, run); break
    case 'Hourly':     lines = hourlyLines(card, run, km, hours); break
    case 'Outstation': lines = outstationLines(card, run, km); break
    default:           lines = null
  }
  if (lines == null) return null

  // Tolls and parking are a pass-through on every category, never marked up.
  if (run.expenses > 0) {
    lines = [...lines, { label: 'Toll / parking', amount: round2(run.expenses) }]
  }

  return { hours, km, lines, total: round2(lines.reduce((sum, l) => sum + l.amount, 0)) }
}
