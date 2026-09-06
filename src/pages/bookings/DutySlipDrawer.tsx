import { useEffect, useState } from 'react'
import { ChevronDown, IndianRupee, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'
import { formatINR } from '../../lib/money'
import { hhmm, kmTotals, packageMins, timeTotals } from '../../lib/dutySlip'
import {
  syncDutyAllowances, loadDutyAllowances, overrideQty, resetQty,
  type DutyAllowanceRow,
} from '../../lib/dutyAllowances'
import { MONTHLY_INCLUDED_HOURS } from '../../lib/allowances'
import { EXPENSE_TYPES } from '../../lib/driver'
import Drawer from '../../components/ui/Drawer'
import Field from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'

/**
 * The duty slip an operator opens once a duty is Completed — what the driver
 * captured, plus the two things the operator still owns: the chargeable
 * expenses and the no-show flag.
 *
 * Everything the driver wrote (odometer pair, timestamps, signature) is read
 * only here. Correcting a reading is FR-56 and needs the corrected_by /
 * corrected_at audit columns filled in, which is a separate job.
 */

const NO_SHOW_REASON = 'Passenger did not show at reporting address'

interface ExpenseRow {
  /** Absent on a row the operator just added. */
  id?: number
  type: string
  amount: string
}

interface Slip {
  date: string
  customer: string
  bookedBy: string
  passenger: string
  passengerExtra: number
  bookingRef: string
  dutyRef: string
  dutyType: string
  vehicleGroup: string
  vehicle: string
  driver: string
  driverId: number | null
  price: number | null
  status: string
  /** duties.duty_type is free text and much of it matches no duty_types row,
   *  which silently means nothing can be billed. The slip has to say so. */
  typeResolved: boolean
  startDate: string
  endDate: string
  reportingTime: string | null
  estDropTime: string | null
  startOdo: number | null
  endOdo: number | null
  totalKm: number | null
  startedAt: string | null
  closedAt: string | null
  thresholdKm: number | null
  pkgMins: number | null
}

// ── formatting ────────────────────────────────────────────────────────────────

function isoToDisplay(iso: string | null) {
  if (!iso) return '—'
  const [yyyy, mm, dd] = iso.split('-')
  return `${dd}/${mm}/${yyyy}`
}

/** A timestamp as the slip prints it: local 24h clock, no date. */
function clock(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const num = (v: number | null) => (v == null ? '—' : String(v))

/** "18:00:00" → "18:00". Postgres time columns arrive with seconds. */
const hm = (t: string | null) => (t ? t.slice(0, 5) : '—')

const UNIT_NOUN: Record<string, string> = { day: 'day', hour: 'hour', duty: 'duty', night: 'night' }

function qtyLabel(qty: number, unit: string): string {
  const noun = UNIT_NOUN[unit] ?? unit
  return `${qty} ${noun}${qty === 1 ? '' : 's'}`
}

// ── row primitives ────────────────────────────────────────────────────────────

function DataRow({ label, value, alt, children }: {
  label: string
  value?: string
  alt: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      className={clsx(
        'flex h-10 items-center justify-between gap-3 border-b border-gray-200 px-6 last:border-b-0',
        alt && 'bg-gray-50',
      )}
    >
      <p className="text-sm font-medium text-gray-900">{label}</p>
      <div className="flex items-center gap-3">
        {value !== undefined && <p className="text-sm text-gray-600 text-right">{value}</p>}
        {children}
      </div>
    </div>
  )
}

function TotalsRow({ label, cells }: { label: string; cells: string[] }) {
  return (
    <div className="grid grid-cols-5 border-b border-gray-200 last:border-b-0">
      <div className="flex h-[72px] items-center bg-gray-50 px-6">
        <p className="text-sm font-medium text-gray-900">{label}</p>
      </div>
      {cells.map((c, i) => (
        <div key={i} className="flex h-[72px] items-center px-6">
          <p className="text-sm text-gray-600 tabular-nums">{c}</p>
        </div>
      ))}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-gray-700">{children}</p>
}

const CARD = 'rounded-xl border border-gray-200 bg-white shadow-xs overflow-hidden'

// ── component ─────────────────────────────────────────────────────────────────

export default function DutySlipDrawer({ dutyId, mode, onClose, onSaved }: {
  dutyId: number
  mode: 'view' | 'edit'
  onClose: () => void
  onSaved?: () => void
}) {
  const { showToast } = useToast()
  // `mode` is the state the drawer opens in, not a lock: a slip opened to read
  // is one click from being edited. The parent unmounts on close, so this
  // re-initialises from the prop every time it opens.
  const [editing, setEditing] = useState(mode === 'edit')
  const readOnly = !editing

  const [slip, setSlip]         = useState<Slip | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [original, setOriginal] = useState<ExpenseRow[]>([])
  const [noShow, setNoShow]     = useState(false)
  const [allowances, setAllowances] = useState<DutyAllowanceRow[]>([])
  const [qtyEdits, setQtyEdits]     = useState<Record<number, string>>({})
  const [allowanceBusy, setAllowanceBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)

      // The client is createClient<any>, so an embedded relation comes back typed
      // as an array however the query is written. Every page here casts the row
      // rather than fight it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: d } = await (supabase as any)
        .from('duties')
        .select(`
          id, booking_id, status, start_date, end_date, reporting_time, est_drop_time,
          duty_type, vehicle_group, base_rate, start_odo, end_odo, total_km,
          started_at, closed_at, no_show_reason, driver_id,
          bookings ( booking_ref, customer_name, booked_by_name,
                     booking_passengers ( name, sort_order ) ),
          vehicles ( model_name, vehicle_number ),
          drivers ( name )
        `)
        .eq('id', dutyId)
        .single()

      if (cancelled) return
      if (!d) { setLoading(false); return }

      // The duty's position inside its booking is what makes "BK-00021-2"
      // meaningful to the customer; the row id alone means nothing to them.
      const [{ data: siblings }, { data: dutyType }, { data: exp }] = await Promise.all([
        supabase.from('duties').select('id').eq('booking_id', d.booking_id).order('id'),
        supabase.from('duty_types').select('threshold_km').eq('type_name', d.duty_type ?? '').maybeSingle(),
        supabase.from('driver_expense_logs').select('id, type, amount').eq('duty_id', dutyId).order('created_at'),
      ])

      if (cancelled) return

      const pos = (siblings ?? []).findIndex((s: { id: number }) => s.id === d.id) + 1
      const passengers = [...(d.bookings?.booking_passengers ?? [])]
        .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)

      setSlip({
        date:           isoToDisplay(d.start_date),
        customer:       d.bookings?.customer_name ?? '—',
        bookedBy:       d.bookings?.booked_by_name ?? '—',
        passenger:      passengers[0]?.name ?? '—',
        passengerExtra: Math.max(0, passengers.length - 1),
        bookingRef:     d.bookings?.booking_ref ?? '—',
        dutyRef:        d.bookings?.booking_ref ? `${d.bookings.booking_ref}-${pos || 1}` : String(d.id),
        dutyType:       d.duty_type ?? '—',
        vehicleGroup:   d.vehicle_group ?? '—',
        vehicle:        d.vehicles ? `${d.vehicles.model_name} - ${d.vehicles.vehicle_number}` : '—',
        driver:         d.drivers?.name ?? '—',
        driverId:       d.driver_id,
        price:          d.base_rate == null ? null : Number(d.base_rate),
        status:         d.status,
        typeResolved:   dutyType != null,
        startDate:      d.start_date,
        endDate:        d.end_date,
        reportingTime:  d.reporting_time,
        estDropTime:    d.est_drop_time,
        startOdo:       d.start_odo == null ? null : Number(d.start_odo),
        endOdo:         d.end_odo == null ? null : Number(d.end_odo),
        totalKm:        d.total_km == null ? null : Number(d.total_km),
        startedAt:      d.started_at,
        closedAt:       d.closed_at,
        thresholdKm:    dutyType?.threshold_km == null ? null : Number(dutyType.threshold_km),
        pkgMins:        packageMins(d.start_date, d.reporting_time, d.end_date, d.est_drop_time),
      })

      const rows: ExpenseRow[] = (exp ?? []).map((r: { id: number; type: string; amount: number }) => ({
        id: r.id, type: r.type, amount: String(Number(r.amount)),
      }))
      setExpenses(rows)
      setOriginal(rows)
      setNoShow(d.no_show_reason != null)
      setLoading(false)

      // Lazily, on the operator's side. A billed duty is skipped inside sync,
      // so opening an invoiced slip never moves its numbers.
      await syncDutyAllowances(dutyId)
      if (cancelled) return
      setAllowances(await loadDutyAllowances(dutyId))
    }

    load()
    return () => { cancelled = true }
  }, [dutyId])

  const km   = slip ? kmTotals(slip.startOdo, slip.endOdo, slip.thresholdKm, slip.totalKm) : { total: null, extra: null }
  const time = slip ? timeTotals(slip.startedAt, slip.closedAt, slip.pkgMins) : { total: null, extra: null }

  async function refreshAllowances() {
    setAllowances(await loadDutyAllowances(dutyId))
  }

  async function commitQty(row: DutyAllowanceRow) {
    const raw = qtyEdits[row.id]
    if (raw === undefined) return
    const qty = Number(raw)
    setQtyEdits(prev => { const n = { ...prev }; delete n[row.id]; return n })
    if (raw.trim() === '' || Number.isNaN(qty) || qty < 0 || qty === row.qty) return

    setAllowanceBusy(true)
    if (await overrideQty(row, qty)) { await refreshAllowances(); showToast(`${row.name} adjusted`) }
    else showToast(`Could not adjust ${row.name}`)
    setAllowanceBusy(false)
  }

  async function undoOverride(row: DutyAllowanceRow) {
    setAllowanceBusy(true)
    if (await resetQty(row)) { await refreshAllowances(); showToast(`${row.name} reset`) }
    else showToast(`Could not reset ${row.name}`)
    setAllowanceBusy(false)
  }

  function setRow(i: number, patch: Partial<ExpenseRow>) {
    setExpenses(prev => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  async function save() {
    if (!slip) return

    const clean = expenses.map(r => ({ ...r, type: r.type.trim(), amount: r.amount.trim() }))
    if (clean.some(r => !r.type || !(Number(r.amount) > 0))) {
      showToast('Every expense needs an item and an amount above zero')
      return
    }
    if (clean.some(r => r.id == null) && slip.driverId == null) {
      showToast('Allot a driver before adding expenses to this duty')
      return
    }

    setSaving(true)

    const removed = original.filter(o => !clean.some(r => r.id === o.id)).map(o => o.id!)
    const added   = clean.filter(r => r.id == null)
    const changed = clean.filter(r => {
      const before = original.find(o => o.id === r.id)
      return before && (before.type !== r.type || before.amount !== r.amount)
    })

    const results = await Promise.all([
      removed.length
        ? supabase.from('driver_expense_logs').delete().in('id', removed)
        : Promise.resolve({ error: null }),
      added.length
        ? supabase.from('driver_expense_logs').insert(added.map(r => ({
            driver_id: slip.driverId,
            duty_id:   dutyId,
            date:      slip.startDate,
            type:      r.type,
            amount:    Number(r.amount),
          })))
        : Promise.resolve({ error: null }),
      ...changed.map(r =>
        supabase.from('driver_expense_logs')
          .update({ type: r.type, amount: Number(r.amount) })
          .eq('id', r.id!),
      ),
      supabase.from('duties')
        .update({ no_show_reason: noShow ? NO_SHOW_REASON : null })
        .eq('id', dutyId),
    ])

    setSaving(false)

    const failed = results.find(r => r.error)
    if (failed) { showToast('Could not save the duty slip'); return }

    showToast('Duty slip saved')
    onSaved?.()
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Duty Slip"
      description={slip ? `${slip.dutyRef} · ${slip.customer}` : undefined}
      width="w-[680px]"
      footer={
        readOnly ? (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 flex-1 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Close
            </button>
            {/* Nothing on a billed slip is editable — the body already refuses
                every field — so the button would open a form that does nothing. */}
            {slip && slip.status !== 'Billed' && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="h-10 flex-1 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors cursor-pointer"
              >
                Edit duty slip
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 flex-1 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || loading}
              onClick={save}
              className="h-10 flex-1 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )
      }
    >
      {loading || !slip ? (
        <p className="py-16 text-center text-sm text-gray-400">Loading duty slip…</p>
      ) : (
        <div className="flex flex-col gap-4">

          {/* Data points */}
          <div className={CARD}>
            <DataRow alt label="Date"          value={slip.date} />
            <DataRow alt={false} label="Customer"      value={slip.customer} />
            <DataRow alt label="Booked by"     value={slip.bookedBy} />
            <DataRow alt={false} label="Passenger"     value={slip.passenger}>
              {slip.passengerExtra > 0 && (
                <span className="flex size-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                  +{slip.passengerExtra}
                </span>
              )}
            </DataRow>
            <DataRow alt label="Booking ID"    value={slip.bookingRef} />
            <DataRow alt={false} label="Duty ID"       value={slip.dutyRef} />
            <DataRow alt label="Duty Type"     value={slip.dutyType} />
            <DataRow alt={false} label="Vehicle Group" value={slip.vehicleGroup} />
            <DataRow alt label="Vehicle"       value={slip.vehicle} />
            <DataRow alt={false} label="Driver"        value={slip.driver} />
            <DataRow alt label="Price"         value={slip.price == null ? '—' : formatINR(slip.price)} />
          </div>

          {/* Totals */}
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Totals</SectionLabel>
            <div className={CARD}>
              <div className="grid grid-cols-5 border-b border-gray-200 bg-gray-50">
                {['', 'Start', 'End', 'Total', 'Extra'].map((h, i) => (
                  <div key={i} className="flex h-11 items-center px-6">
                    <p className="text-xs font-medium text-gray-600">{h}</p>
                  </div>
                ))}
              </div>
              <TotalsRow
                label="KM"
                cells={[num(slip.startOdo), num(slip.endOdo), num(km.total), num(km.extra)]}
              />
              <TotalsRow
                label="Time"
                cells={[clock(slip.startedAt), clock(slip.closedAt), hhmm(time.total), hhmm(time.extra)]}
              />
            </div>
          </div>

          {/* Offset kilometer reading — ponytail: no column holds an offset, and
              "subsequent exports" means it has to outlive this duty. Shipped
              visible and disabled rather than faked. */}
          <div className={clsx(CARD, 'flex items-start gap-4 p-6')}>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-md font-medium text-gray-900">Offset Kilometer reading</p>
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                  Soon
                </span>
              </div>
              <p className="mt-0.5 text-sm text-gray-500">
                Adjust the kilometer reading for this and subsequent duty slip exports
              </p>
            </div>
            <span
              aria-hidden
              className="mt-1 flex h-5 w-9 shrink-0 items-center rounded-full bg-gray-100 p-0.5"
            >
              <span className="size-4 rounded-full bg-gray-50 shadow-sm" />
            </span>
          </div>

          {/* Allowances */}
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Allowances</SectionLabel>

            {!slip.typeResolved && (
              <div className="rounded-lg border border-warning-200 bg-warning-25 px-3 py-2">
                <p className="text-xs text-warning-700">
                  <span className="font-medium">"{slip.dutyType}" matches no duty type.</span>{' '}
                  The driver is still paid, but nothing can be billed to the customer
                  until a duty type of that exact name exists with its allowances priced.
                </p>
              </div>
            )}

            {slip.status === 'Billed' && (
              <p className="text-xs text-gray-500">
                This duty has been billed — its allowances are frozen as invoiced.
              </p>
            )}

            <div className={CARD}>
              <div className="grid grid-cols-[1fr_92px_104px_112px] border-b border-gray-200 bg-gray-50">
                {['Allowance', 'Qty', 'Driver', 'Customer'].map((h, i) => (
                  <div key={h} className={clsx('flex h-11 items-center px-4', i === 0 && 'pl-6')}>
                    <p className={clsx('text-xs font-medium text-gray-600', i > 0 && 'w-full text-right')}>{h}</p>
                  </div>
                ))}
              </div>

              {allowances.length === 0 ? (
                <div className="px-6 py-5">
                  <p className="text-sm text-gray-500">No allowances on this duty.</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Nothing was triggered by its dates, timings or duty type.
                  </p>
                </div>
              ) : (
                <>
                  {allowances.map(row => {
                    const edited = row.source === 'manual'
                    const observed =
                      row.code === 'overtime'    ? `closed ${clock(slip.closedAt)} · due ${hm(slip.estDropTime)}`
                    : row.code === 'early_start' ? `started ${clock(slip.startedAt)} · due ${hm(slip.reportingTime)}`
                    : row.code === 'extra_hour'  ? `ran ${clock(slip.startedAt)} – ${clock(slip.closedAt)} · ${MONTHLY_INCLUDED_HOURS}h included`
                    : null
                    const rateLine = row.driverRate != null ? `${formatINR(row.driverRate)} × ${row.qty}` : null
                    const detail = [observed, rateLine].filter(Boolean).join(' · ')

                    return (
                      <div key={row.id} className="grid grid-cols-[1fr_92px_104px_112px] items-start border-b border-gray-200 py-3 last:border-b-0">
                        <div className="min-w-0 pl-6 pr-3">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-gray-900">{row.name}</p>
                            {edited && (
                              <span className="shrink-0 rounded-full border border-warning-200 bg-warning-25 px-1.5 py-0.5 text-[10px] font-medium text-warning-700">
                                Edited
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
                            {detail && <p className="text-xs text-gray-400">{detail}</p>}
                            {edited && row.autoQty != null && (
                              <p className="text-xs text-gray-400">was {qtyLabel(row.autoQty, row.unit)}</p>
                            )}
                            {edited && !readOnly && slip.status !== 'Billed' && (
                              <button
                                type="button" onClick={() => undoOverride(row)} disabled={allowanceBusy}
                                className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-800 cursor-pointer disabled:opacity-50"
                              >
                                <RotateCcw className="size-3" strokeWidth={2} />Reset
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="px-2">
                          {readOnly || slip.status === 'Billed' ? (
                            <p className="text-sm text-gray-600 text-right tabular-nums">{row.qty}</p>
                          ) : (
                            <input
                              type="number" min="0" step="1"
                              value={qtyEdits[row.id] ?? String(row.qty)}
                              disabled={allowanceBusy}
                              onChange={e => setQtyEdits(prev => ({ ...prev, [row.id]: e.target.value }))}
                              onBlur={() => commitQty(row)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              aria-label={`${row.name} quantity`}
                              className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm text-right text-gray-900 tabular-nums outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-50"
                            />
                          )}
                          <p className="mt-0.5 text-[10px] text-gray-400 text-right">{UNIT_NOUN[row.unit] ?? row.unit}s</p>
                        </div>

                        <div className="px-4">
                          <p className="text-sm text-gray-900 text-right tabular-nums">{formatINR(row.driverAmount)}</p>
                        </div>

                        <div className="px-4 pr-6">
                          {row.customerRate == null ? (
                            <p className="text-sm text-gray-400 text-right">not billed</p>
                          ) : (
                            <p className="text-sm text-gray-900 text-right tabular-nums">{formatINR(row.customerAmount)}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  <div className="grid grid-cols-[1fr_92px_104px_112px] items-center bg-gray-50 py-3">
                    <p className="pl-6 text-sm font-medium text-gray-900">Total</p>
                    <span />
                    <p className="px-4 text-sm font-semibold text-gray-900 text-right tabular-nums">
                      {formatINR(allowances.reduce((t, r) => t + r.driverAmount, 0))}
                    </p>
                    <p className="px-4 pr-6 text-sm font-semibold text-gray-900 text-right tabular-nums">
                      {formatINR(allowances.reduce((t, r) => t + r.customerAmount, 0))}
                    </p>
                  </div>
                </>
              )}
            </div>

            {!readOnly && slip.status !== 'Billed' && allowances.length > 0 && (
              <p className="text-xs text-gray-400">
                Adjust a quantity to correct what was counted. Rates come from the rate
                card and are not editable here.
              </p>
            )}
          </div>

          {/* Additional expenses */}
          <div className={clsx(CARD, 'flex flex-col gap-4 p-6')}>
            <p className="text-md font-medium text-gray-900">Additional expenses</p>

            {expenses.length === 0 && (
              <p className="text-sm text-gray-400">No expenses recorded on this duty.</p>
            )}

            {expenses.map((row, i) => (
              <div key={row.id ?? `new-${i}`} className="flex items-end gap-3">
                <div className="grid flex-1 grid-cols-2 gap-4">
                  <Field label="Item" required={!readOnly}>
                    <div className="relative">
                      <select
                        disabled={readOnly}
                        value={row.type}
                        onChange={e => setRow(i, { type: e.target.value })}
                        className={clsx(
                          'w-full appearance-none rounded-lg border border-gray-300 px-3.5 py-2.5 pr-10 text-sm text-gray-900 shadow-xs outline-none transition-shadow',
                          readOnly ? 'bg-gray-50 text-gray-500' : 'bg-white focus:border-violet-400 focus:ring-4 focus:ring-violet-100',
                          !row.type && 'text-gray-400',
                        )}
                      >
                        <option value="" disabled>Select one</option>
                        {/* The vocabulary the driver app writes — same list, so
                            the two sides never disagree about "Toll". */}
                        {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        {/* A row already saved with a type outside the list still shows. */}
                        {row.type && !EXPENSE_TYPES.includes(row.type as typeof EXPENSE_TYPES[number]) && (
                          <option value={row.type}>{row.type}</option>
                        )}
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute right-3.5 top-1/2 size-5 -translate-y-1/2 text-gray-500"
                        strokeWidth={1.75}
                      />
                    </div>
                  </Field>

                  <Field label="Amount" required={!readOnly}>
                    <div className="relative">
                      <IndianRupee
                        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-gray-500"
                        strokeWidth={1.75}
                      />
                      <input
                        type="number"
                        min="0"
                        readOnly={readOnly}
                        value={row.amount}
                        onChange={e => setRow(i, { amount: e.target.value })}
                        placeholder="0"
                        className={clsx(
                          'w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3.5 text-sm text-gray-900 shadow-xs outline-none transition-shadow placeholder:text-gray-400',
                          readOnly ? 'bg-gray-50 text-gray-500' : 'focus:border-violet-400 focus:ring-4 focus:ring-violet-100',
                        )}
                      />
                    </div>
                  </Field>
                </div>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setExpenses(prev => prev.filter((_, j) => j !== i))}
                    title="Remove item"
                    className="mb-1 rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="size-4" strokeWidth={1.75} />
                  </button>
                )}
              </div>
            ))}

            {!readOnly && (
              <button
                type="button"
                onClick={() => setExpenses(prev => [...prev, { type: '', amount: '' }])}
                className="flex w-fit items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 shadow-xs transition-colors hover:bg-gray-50 cursor-pointer"
              >
                <Plus className="size-4" strokeWidth={1.75} />
                Add another item
              </button>
            )}
          </div>

          {/* No show */}
          <label className={clsx('flex items-center gap-2', !readOnly && 'cursor-pointer')}>
            <input
              type="checkbox"
              disabled={readOnly}
              checked={noShow}
              onChange={e => setNoShow(e.target.checked)}
              className="size-4 rounded border-gray-300 accent-violet-600"
            />
            <span className="text-sm text-gray-700">Mark passenger did not show at reporting address</span>
          </label>

        </div>
      )}
    </Drawer>
  )
}
