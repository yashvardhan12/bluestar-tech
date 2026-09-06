// Shared between CreateInvoicePage and AddBookingsDrawer.

import { supabase } from '../../lib/supabase'
import { priceDuty, type RateCard } from '../../lib/dutyPrice'

/** One allowance this duty charged the customer, for the printed breakdown. */
export interface DutyAllowanceLine {
  name: string
  qty: number
  unit: string
  rate: number
  amount: number
}

export interface DutyRow {
  id: number
  date: string          // display, DD/MM/YYYY
  vehicle: string
  plate: string
  dutyType: string
  baseRate: number | null
  /** True when baseRate came from the duty type rate card rather than from a
   *  figure somebody typed. The operator has to be able to tell the two apart. */
  computed: boolean
  /** Total customer-billed allowances. Named to match CalcDuty so a DutyRow can
   *  be handed straight to calculateInvoice. */
  allowances: number
  /** The same total, broken out — the printed invoice itemises it. */
  allowanceLines: DutyAllowanceLine[]
}

/** Sum of what this duty's allowances charged the customer. */
export function allowanceTotal(raw: any[]): number {
  return Math.round((raw ?? []).reduce((t, r) => t + Number(r.customer_amount ?? 0), 0) * 100) / 100
}

/** Rows are snapshotted with customer_amount already computed; unpriced
 *  allowances store 0 and must not print as a free line on the invoice. */
export function toAllowanceLines(raw: any[]): DutyAllowanceLine[] {
  return (raw ?? [])
    .filter(r => Number(r.customer_amount) > 0)
    .map(r => ({
      name:   r.allowances?.name ?? 'Allowance',
      unit:   r.allowances?.unit ?? 'duty',
      qty:    Number(r.qty),
      rate:   Number(r.customer_rate ?? 0),
      amount: Number(r.customer_amount),
    }))
}

export interface BookingBlock {
  bookingId: number
  bookingRef: string
  dateRange: string     // display
  customDescription: string
  duties: DutyRow[]
}


// ── car hire from the rate card ──────────────────────────────────────────────
//
// Duty types are master data the operator maintains; the arithmetic that turns
// one into money lives in lib/dutyPrice.ts. Billing joins the two here.
//
// A typed base_rate always wins. Computation only fills the blank — which is
// the normal case for imported bookings, where importBookings.ts refuses to
// take a rate from the sheet at all. Silently repricing a duty somebody costed
// by hand is how a customer finds out about a change before you do.

/** Columns every duties select in billing needs. Kept in one place so the query
 *  and toDutyRow() cannot drift apart. */
export const DUTY_SELECT =
  `id, status, start_date, end_date, duty_type, base_rate, started_at, closed_at, start_odo, end_odo, total_km,
   vehicles(model_name, vehicle_number),
   duty_allowances(qty, customer_rate, customer_amount, allowances(name, unit))`

export type RateCards = Map<string, RateCard>

/**
 * The company's rate cards, keyed by the name duties refer to them by.
 *
 * duties.duty_type is text, not a foreign key, so this is a name lookup rather
 * than an embed — the same join dutyAllowances.ts makes. type_name is unique
 * per company (migration 028) and RLS scopes the read, so the map is unambiguous.
 */
export async function loadRateCards(): Promise<RateCards> {
  const { data, error } = await supabase
    .from('duty_types')
    .select('type_name, category, fixed_charges, threshold_km, rate_0_6_hrs, rate_6_12_hrs, rate_12_plus_hrs, rate_per_km, night_charges, daily_outstation_charges')
  if (error) { console.error('[billing] rate cards', error.message); return new Map() }

  const num = (v: any) => (v == null ? null : Number(v))
  return new Map((data ?? []).map((d: any) => [d.type_name, {
    category:               d.category,
    fixedCharges:           num(d.fixed_charges),
    thresholdKm:            num(d.threshold_km),
    rate0to6Hrs:            num(d.rate_0_6_hrs),
    rate6to12Hrs:           num(d.rate_6_12_hrs),
    rate12PlusHrs:          num(d.rate_12_plus_hrs),
    ratePerKm:              num(d.rate_per_km),
    nightCharges:           num(d.night_charges),
    dailyOutstationCharges: num(d.daily_outstation_charges),
  }]))
}

/** One duty row for the invoice. `fmt` is the page's own date formatter. */
export function toDutyRow(d: any, cards: RateCards, fmt: (iso: string) => string): DutyRow {
  const entered = d.base_rate == null ? null : Number(d.base_rate)
  const card = cards.get(d.duty_type ?? '')
  // Tolls and parking are not fed in: they reach the invoice today as custom
  // rows, and charging them from driver_expenses as well would bill them twice.
  const price = entered != null || !card ? null : priceDuty(card, {
    startDate: d.start_date,
    endDate:   d.end_date ?? d.start_date,
    startedAt: d.started_at,
    closedAt:  d.closed_at,
    startOdo:  d.start_odo == null ? null : Number(d.start_odo),
    endOdo:    d.end_odo == null ? null : Number(d.end_odo),
    totalKm:   d.total_km == null ? null : Number(d.total_km),
    expenses:  0,
  })

  return {
    id:             d.id,
    date:           fmt(d.start_date ?? ''),
    vehicle:        d.vehicles?.model_name ?? '\u2014',
    plate:          d.vehicles?.vehicle_number ?? '',
    dutyType:       d.duty_type ?? '\u2014',
    baseRate:       entered ?? price?.total ?? null,
    computed:       entered == null && price != null,
    allowances:     allowanceTotal(d.duty_allowances),
    allowanceLines: toAllowanceLines(d.duty_allowances),
  }
}
