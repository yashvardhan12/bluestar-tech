// The bridge between the pure allowance arithmetic and the database.
//
// Nothing here decides anything: it gathers the facts a duty implies, hands
// them to computeAllowances(), and reconciles the result against what is
// already stored. All the rules live in allowances.ts, where they can be
// checked without a browser.
//
// Deliberately NOT called from driver_close_duty: computing at close time
// would need new driver-side RLS on duty_allowances for no gain. The operator
// side syncs lazily instead — opening a duty slip, or building an invoice.

import { supabase } from './supabase'
import { round2 } from './money'
import { computeAllowances, type AllowanceRule, type DutyFacts } from './allowances'

export interface DutyAllowanceRow {
  id: number
  allowanceId: number
  name: string
  unit: string
  code: string
  qty: number
  autoQty: number | null
  driverRate: number | null
  driverAmount: number
  customerRate: number | null
  customerAmount: number
  source: 'auto' | 'manual'
}

/** Facts the slip needs to print the derivation behind an hourly line. */
export interface DutyContext {
  status: string
  estDropTime: string | null
  reportingTime: string | null
  closedAt: string | null
  startedAt: string | null
  endDate: string
  startDate: string
}

/**
 * Recompute a duty's allowances and persist them.
 *
 * Rows the operator has overridden (`source = 'manual'`) are left exactly as
 * they are — a recompute must never quietly undo a correction. A duty that has
 * been billed is skipped entirely: its snapshot is the record of what was
 * invoiced and stops moving.
 */
export async function syncDutyAllowances(dutyId: number): Promise<void> {
  const { data: duty, error: dutyErr } = await supabase
    .from('duties')
    .select('id, status, start_date, end_date, reporting_time, est_drop_time, started_at, closed_at, duty_type, driver_id, bookings(is_airport_booking)')
    .eq('id', dutyId)
    .maybeSingle()

  if (dutyErr) { console.error('[dutyAllowances] load duty', dutyErr.message); return }
  if (!duty) return
  // Billed is frozen. Cancelled still runs, so an existing snapshot gets cleared.
  if (duty.status === 'Billed') return

  const [dtRes, drvRes, sibRes, alRes] = await Promise.all([
    // type_name is unique per company as of migration 028, so this is single-valued.
    supabase.from('duty_types').select('id, category').eq('type_name', duty.duty_type ?? '').maybeSingle(),
    duty.driver_id
      ? supabase.from('drivers').select('off_day, shift_start_time, shift_end_time').eq('id', duty.driver_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    duty.driver_id
      ? supabase.from('duties').select('id, reporting_time').eq('driver_id', duty.driver_id)
          .eq('start_date', duty.start_date).neq('status', 'Cancelled')
      : Promise.resolve({ data: null, error: null }),
    supabase.from('allowances').select('id, code, unit, baseline, driver_rate, is_active'),
  ])

  if (alRes.error) { console.error('[dutyAllowances] load rate card', alRes.error.message); return }

  const dutyTypeId = (dtRes.data as any)?.id ?? null
  let customerRates: Record<number, number> = {}
  if (dutyTypeId) {
    const { data, error } = await supabase
      .from('duty_type_allowances').select('allowance_id, customer_rate').eq('duty_type_id', dutyTypeId)
    if (error) console.error('[dutyAllowances] load prices', error.message)
    customerRates = Object.fromEntries((data ?? []).map((r: any) => [r.allowance_id, Number(r.customer_rate)]))
  }

  // Order by reporting time so "second duty of the day" means the second one
  // the driver actually reported for, not the one entered second.
  const siblings = ((sibRes.data as any[]) ?? [])
    .slice()
    .sort((a, b) => (a.reporting_time ?? '').localeCompare(b.reporting_time ?? ''))
  const idx = siblings.findIndex(d => d.id === dutyId)

  const driver = drvRes.data as any
  const facts: DutyFacts = {
    status:           duty.status,
    startDate:        duty.start_date,
    endDate:          duty.end_date,
    reportingTime:    duty.reporting_time,
    estDropTime:      duty.est_drop_time,
    startedAt:        duty.started_at,
    closedAt:         duty.closed_at,
    category:         (dtRes.data as any)?.category ?? null,
    isAirportBooking: Boolean((duty as any).bookings?.is_airport_booking),
    dutyIndexOfDay:   idx >= 0 ? idx + 1 : 1,
    driverOffDay:     driver?.off_day ?? null,
    driverShiftStart: driver?.shift_start_time ?? null,
    driverShiftEnd:   driver?.shift_end_time ?? null,
  }

  const rules: AllowanceRule[] = ((alRes.data as any[]) ?? []).map(a => ({
    id: a.id, code: a.code, unit: a.unit, baseline: a.baseline,
    driverRate: a.driver_rate != null ? Number(a.driver_rate) : null,
    isActive: a.is_active,
  }))

  const lines = computeAllowances(facts, rules, customerRates)

  const { data: existing, error: exErr } = await supabase
    .from('duty_allowances').select('id, allowance_id, source').eq('duty_id', dutyId)
  if (exErr) { console.error('[dutyAllowances] load existing', exErr.message); return }

  const manual = new Set((existing ?? []).filter((r: any) => r.source === 'manual').map((r: any) => r.allowance_id))
  const autoIds = new Map((existing ?? []).filter((r: any) => r.source === 'auto').map((r: any) => [r.allowance_id, r.id]))

  const upserts = lines.filter(l => !manual.has(l.allowanceId)).map(l => ({
    duty_id:         dutyId,
    allowance_id:    l.allowanceId,
    qty:             l.qty,
    customer_rate:   l.customerRate,
    customer_amount: l.customerAmount,
    driver_rate:     l.driverRate,
    driver_amount:   l.driverAmount,
    source:          'auto',
  }))

  if (upserts.length > 0) {
    const { error } = await supabase
      .from('duty_allowances').upsert(upserts, { onConflict: 'duty_id,allowance_id' })
    if (error) { console.error('[dutyAllowances] upsert', error.message); return }
  }

  // An auto row whose allowance no longer fires — the dates were corrected, the
  // rate card changed — has to go, or the slip keeps billing something that is
  // no longer true. Manual rows are never swept: they are somebody's decision.
  const stillFiring = new Set(lines.map(l => l.allowanceId))
  const stale = [...autoIds.entries()].filter(([aid]) => !stillFiring.has(aid)).map(([, id]) => id)
  if (stale.length > 0) {
    const { error } = await supabase.from('duty_allowances').delete().in('id', stale)
    if (error) console.error('[dutyAllowances] sweep', error.message)
  }
}

/** Read a duty's stored allowances, newest rate card names attached. */
export async function loadDutyAllowances(dutyId: number): Promise<DutyAllowanceRow[]> {
  const { data, error } = await supabase
    .from('duty_allowances')
    .select('id, allowance_id, qty, auto_qty, driver_rate, driver_amount, customer_rate, customer_amount, source, allowances(name, unit, code)')
    .eq('duty_id', dutyId)
    .order('allowance_id')

  if (error) { console.error('[dutyAllowances] load', error.message); return [] }

  return (data ?? []).map((r: any) => ({
    id:             r.id,
    allowanceId:    r.allowance_id,
    name:           r.allowances?.name ?? 'Allowance',
    unit:           r.allowances?.unit ?? 'duty',
    code:           r.allowances?.code ?? '',
    qty:            Number(r.qty),
    autoQty:        r.auto_qty != null ? Number(r.auto_qty) : null,
    driverRate:     r.driver_rate != null ? Number(r.driver_rate) : null,
    driverAmount:   Number(r.driver_amount),
    customerRate:   r.customer_rate != null ? Number(r.customer_rate) : null,
    customerAmount: Number(r.customer_amount),
    source:         r.source,
  }))
}

/**
 * Override one line's quantity. Amounts always stay rate × qty so the row keeps
 * explaining itself — the rate is never edited here, because it belongs to the
 * rate card rather than to one duty.
 */
export async function overrideQty(row: DutyAllowanceRow, qty: number): Promise<boolean> {
  const { error } = await supabase.from('duty_allowances').update({
    qty,
    // Keep the first computed value, not the previous manual one.
    auto_qty:        row.autoQty ?? row.qty,
    driver_amount:   round2(qty * (row.driverRate ?? 0)),
    customer_amount: round2(qty * (row.customerRate ?? 0)),
    source:          'manual',
  }).eq('id', row.id)
  if (error) console.error('[dutyAllowances] override', error.message)
  return !error
}

/** Put an overridden line back to what the calculation said. */
export async function resetQty(row: DutyAllowanceRow): Promise<boolean> {
  const qty = row.autoQty ?? row.qty
  const { error } = await supabase.from('duty_allowances').update({
    qty,
    auto_qty:        null,
    driver_amount:   round2(qty * (row.driverRate ?? 0)),
    customer_amount: round2(qty * (row.customerRate ?? 0)),
    source:          'auto',
  }).eq('id', row.id)
  if (error) console.error('[dutyAllowances] reset', error.message)
  return !error
}
