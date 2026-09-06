import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Upload, FileSpreadsheet, Check, AlertCircle, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useActiveCompany } from '../../lib/useActiveCompany'
import { createBooking } from '../../lib/createBooking'
import {
  buildImportPlan, bookingPayload, dutyShared, missingColumns,
  type ImportPlan, type MissingRef, type ReferenceData, type SheetRow,
} from '../../lib/importBookings'

// Bulk import of a client trip export.
//
// A modal rather than a Drawer: the overview is a wide read-only report the
// operator confirms, not a form they fill in. Nothing is written until they
// press Add — and everything the file means is decided in importBookings.ts,
// which is checked without a browser.

interface Props {
  open: boolean
  onClose: () => void
  onImported?: () => void
}

interface Outcome { created: number; failed: number; partial: number; messages: string[] }

export default function ImportBookingsModal({ open, onClose, onImported }: Props) {
  const company = useActiveCompany()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState('')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [writing, setWriting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const reset = useCallback(() => {
    setFileName(''); setPlan(null); setError(null)
    setReading(false); setWriting(false); setProgress(0); setOutcome(null)
  }, [])

  useEffect(() => { if (open) reset() }, [open, reset])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !writing) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, writing])

  async function loadReference(): Promise<ReferenceData | string> {
    const [cust, types, locs, refs] = await Promise.all([
      supabase.from('customers').select('name'),
      supabase.from('duty_types').select('type_name, category, vehicle_groups(name)'),
      supabase.from('locations').select('name'),
      // Duty dates, not just a count: a long trip can arrive split across two
      // monthly exports, and skipping on booking_ref alone would drop its later
      // days. A booking left duty-less by an interrupted run must also re-run.
      supabase.from('bookings').select('booking_ref, duties(start_date)'),
    ])
    for (const r of [cust, types, locs, refs]) {
      if (r.error) return `Could not read reference data: ${r.error.message}`
    }
    // RLS returns zero rows rather than an error when the user has no company.
    if (!company) return 'No active company. Pick one before importing.'

    return {
      customers: (cust.data ?? []).map((c: { name: string }) => c.name),
      dutyTypes: (types.data ?? []).map((d: { type_name: string; category: string; vehicle_groups: unknown }) => {
        const vg = d.vehicle_groups as { name: string } | { name: string }[] | null
        return {
          name: d.type_name,
          category: d.category,
          vehicleGroup: (Array.isArray(vg) ? vg[0]?.name : vg?.name) ?? null,
        }
      }),
      locations: (locs.data ?? []).map((l: { name: string }) => l.name),
      existingDuties: Object.fromEntries(
        (refs.data ?? []).map((b: { booking_ref: string; duties: { start_date: string }[] | null }) =>
          [b.booking_ref, (b.duties ?? []).map(d => d.start_date)]),
      ),
    }
  }

  async function handleFile(file: File) {
    setReading(true); setError(null); setPlan(null); setOutcome(null)
    setFileName(file.name)
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames.includes('Trip') ? 'Trip' : wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: null, raw: false })
      if (rows.length === 0) { setError('That sheet has no rows.'); return }

      const missing = missingColumns(Object.keys(rows[0]))
      if (missing.length > 0) {
        setError(`This export is missing ${missing.length} expected column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Nothing was read.`)
        return
      }

      const ref = await loadReference()
      if (typeof ref === 'string') { setError(ref); return }
      setPlan(buildImportPlan(rows, ref))
    } catch (e) {
      setError(`Could not read that file: ${(e as Error).message}`)
    } finally {
      setReading(false)
    }
  }

  async function handleImport() {
    if (!plan) return
    setWriting(true); setProgress(0)
    const result: Outcome = { created: 0, failed: 0, partial: 0, messages: [] }

    for (let i = 0; i < plan.ready.length; i++) {
      const b = plan.ready[i]
      const r = await createBooking({
        bookingRef: b.travelId,
        booking: bookingPayload(b),
        passengers: [],
        shared: dutyShared(b),
        category: b.category,
        startDate: b.startDate,
        endDate: b.endDate,
        duties: b.duties,
      })
      if (r.error) {
        result.failed++
        if (result.messages.length < 5) result.messages.push(`${b.travelId}: ${r.error}`)
      } else {
        result.created++
        if (r.partial) {
          result.partial++
          if (result.messages.length < 5) result.messages.push(`${b.travelId}: ${r.partial}`)
        }
      }
      setProgress(i + 1)
    }

    setWriting(false)
    setOutcome(result)
    if (result.created > 0) onImported?.()
  }

  if (!open) return null

  const ready = plan?.ready.length ?? 0
  const skipped = plan?.bookings.filter(b => b.alreadyImported).length ?? 0
  const blocked = (plan?.bookings.length ?? 0) - ready - skipped

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-gray-950/70 backdrop-blur-sm" onClick={() => !writing && onClose()} />

      <div className="relative flex flex-col w-full max-w-4xl max-h-[86vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="shrink-0 flex items-start justify-between px-6 pt-6 pb-5 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Import duties</h2>
            <p className="mt-1 text-sm text-gray-500">
              {company
                ? <>Bookings will be created for <span className="font-medium text-gray-700">{company.name}</span>. Nothing is saved until you press Add.</>
                : 'Reading the client trip export.'}
            </p>
          </div>
          <button
            type="button" onClick={onClose} disabled={writing}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* ── step 1: pick a file ─────────────────────────────────────── */}
          {!plan && !outcome && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={reading}
              className="w-full flex flex-col items-center gap-2 px-6 py-12 border-2 border-dashed border-gray-300 rounded-xl hover:border-violet-400 hover:bg-violet-50 transition-colors cursor-pointer disabled:opacity-60"
            >
              {reading
                ? <Loader2 className="size-8 text-violet-600 animate-spin" strokeWidth={1.75} />
                : <Upload className="size-8 text-gray-400" strokeWidth={1.75} />}
              <span className="text-sm font-semibold text-gray-700">
                {reading ? 'Reading…' : 'Choose the trip export'}
              </span>
              <span className="text-xs text-gray-500">.xlsx, .xlsm or .csv</span>
            </button>
          )}
          <input
            ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = '' }}
          />

          {error && (
            <div className="mt-4 flex items-start gap-2.5 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="size-4 text-red-600 shrink-0 mt-0.5" strokeWidth={1.75} />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* ── step 3: what happened ───────────────────────────────────── */}
          {outcome && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-green-50 border border-green-200">
                <Check className="size-4 text-green-600 shrink-0 mt-0.5" strokeWidth={2} />
                <p className="text-sm text-green-800">
                  Created {outcome.created} booking{outcome.created === 1 ? '' : 's'}.
                  {outcome.failed > 0 && ` ${outcome.failed} failed.`}
                  {outcome.partial > 0 && ` ${outcome.partial} saved without all their rows — re-run the file to repair them.`}
                </p>
              </div>
              {outcome.messages.length > 0 && (
                <ul className="text-xs text-gray-600 font-mono flex flex-col gap-1">
                  {outcome.messages.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              )}
            </div>
          )}

          {/* ── step 2: the overview ────────────────────────────────────── */}
          {plan && !outcome && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <FileSpreadsheet className="size-4" strokeWidth={1.75} />
                <span className="font-medium text-gray-700">{fileName}</span>
                <span>· {plan.rowCount.toLocaleString('en-IN')} rows · {plan.bookings.length} bookings</span>
              </div>

              <div className={clsx('grid gap-3', skipped > 0 && blocked > 0 ? 'grid-cols-3' : skipped > 0 || blocked > 0 ? 'grid-cols-2' : 'grid-cols-1')}>
                <Tally n={ready} label="Ready" tone="ok" hint={`${plan.ready.reduce((s, b) => s + b.duties.length, 0)} duties`} />
                {skipped > 0 && <Tally n={skipped} label="Already imported" tone="mute" hint="skipped on re-run" />}
                {blocked > 0 && <Tally n={blocked} label="Blocked" tone="stop" hint="missing reference data" />}
              </div>

              <Cause title="Customers not found" items={plan.missingCustomers} tone="stop" />
              <Cause title="Duty types not found" items={plan.missingDutyTypes} tone="stop" />
              <Cause title="Locations not found" items={plan.missingLocations} tone="warn" />

              {plan.incomplete.length > 0 && (
                <div className="border border-amber-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-200">
                    <div className="flex items-center gap-2.5">
                      <span className="size-1.5 rounded-full bg-amber-500" />
                      <p className="text-sm font-semibold text-gray-700">Already imported, but this file has more days</p>
                    </div>
                    <p className="text-xs text-gray-500">{plan.incomplete.length} booking{plan.incomplete.length === 1 ? '' : 's'}</p>
                  </div>
                  <ul>
                    {plan.incomplete.slice(0, 6).map(i => (
                      <li key={i.travelId} className="flex items-baseline justify-between gap-4 px-4 py-2 border-b border-gray-100 last:border-0">
                        <span className="text-sm font-mono text-gray-700">{i.travelId}</span>
                        <span className="text-xs text-gray-500 shrink-0">
                          has {i.existingDuties} duties · file has {i.inSheet} · {i.missingDates.length} new day{i.missingDates.length === 1 ? '' : 's'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="px-4 py-2 text-xs text-gray-500 bg-amber-50">
                    Not imported — adding duties to an existing booking is a separate action. Delete the booking and re-run the file to rebuild it in full.
                  </p>
                </div>
              )}

              {plan.duplicateRows.length > 0 && (
                <div className="border border-amber-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-200">
                    <div className="flex items-center gap-2.5">
                      <span className="size-1.5 rounded-full bg-amber-500" />
                      <p className="text-sm font-semibold text-gray-700">Repeated days in the sheet</p>
                    </div>
                    <p className="text-xs text-gray-500">{plan.duplicateRows.length} day{plan.duplicateRows.length === 1 ? '' : 's'}</p>
                  </div>
                  <ul>
                    {plan.duplicateRows.slice(0, 6).map(d => (
                      <li key={`${d.travelId}-${d.date}`} className="flex items-baseline justify-between gap-4 px-4 py-2 border-b border-gray-100 last:border-0">
                        <span className="text-sm font-mono text-gray-700">{d.travelId} · {d.date}</span>
                        <span className="text-xs text-gray-500 shrink-0">{d.count} rows · first kept</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {plan.unresolved.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                    <p className="text-sm font-semibold text-gray-700">Duty window could not be resolved</p>
                    <p className="text-xs text-gray-500">{plan.unresolved.length} rows</p>
                  </div>
                  <ul>
                    {plan.unresolved.slice(0, 6).map((u, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-4 px-4 py-2 border-b border-gray-100 last:border-0">
                        <span className="text-sm text-gray-700 font-mono">{u.travelId} · {u.when}</span>
                        <span className="text-xs text-gray-500 shrink-0">{u.reason}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="px-4 py-2 text-xs text-gray-500 bg-gray-50">
                    Excluded from the import. Correct the times in the sheet and re-run, or enter them by hand.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500">
            {writing && `Adding ${progress} of ${ready}…`}
            {!writing && plan && !outcome && blocked > 0 && 'Add the missing records in Database, then re-run this file.'}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button" onClick={onClose} disabled={writing}
              className="px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-semibold text-gray-700 shadow-xs hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              {outcome ? 'Close' : 'Cancel'}
            </button>
            {plan && !outcome && (
              <button
                type="button" onClick={handleImport} disabled={writing || ready === 0}
                className="px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg shadow-xs hover:bg-violet-700 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {writing ? 'Adding…' : `Add ${ready} booking${ready === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Tally({ n, label, tone, hint }: {
  n: number; label: string; tone: 'ok' | 'stop' | 'mute'; hint: string
}) {
  return (
    <div className="relative overflow-hidden border border-gray-200 rounded-xl px-4 py-3 bg-gray-50">
      <span className={clsx('absolute left-0 top-0 bottom-0 w-1',
        tone === 'ok' ? 'bg-green-600' : tone === 'stop' ? 'bg-red-500' : 'bg-gray-300')} />
      <p className="text-2xl font-semibold text-gray-900 tabular-nums">{n}</p>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mt-0.5">{label}</p>
      <p className="text-xs text-gray-400 mt-1">{hint}</p>
    </div>
  )
}

/**
 * Grouped by cause and ordered by blast radius, so the next thing to fix is
 * first. Renders nothing when the cause is clear — a report of empty sections
 * buries the one thing that actually needs doing.
 */
function Cause({ title, items, tone }: { title: string; items: MissingRef[]; tone: 'stop' | 'warn' }) {
  if (items.length === 0) return null
  const affected = items.reduce((s, i) => s + i.bookings, 0)
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <span className={clsx('size-1.5 rounded-full', tone === 'stop' ? 'bg-red-500' : 'bg-amber-500')} />
          <p className="text-sm font-semibold text-gray-700">{title}</p>
        </div>
        <p className="text-xs text-gray-500">
          {items.length} missing · {affected} booking{affected === 1 ? '' : 's'}
        </p>
      </div>
      <ul>
        {items.slice(0, 6).map(i => (
          <li key={i.key} className="flex items-baseline justify-between gap-4 px-4 py-2 border-b border-gray-100 last:border-0">
            <div className="flex items-baseline gap-2.5 min-w-0">
              {i.key !== i.label && <span className="text-xs font-mono text-gray-500 shrink-0">{i.key}</span>}
              <span className="text-sm text-gray-900 truncate">{i.label}</span>
            </div>
            <span className="text-xs text-gray-500 shrink-0">{i.bookings} booking{i.bookings === 1 ? '' : 's'}</span>
          </li>
        ))}
      </ul>
      {items.length > 6 && (
        <p className="px-4 py-2 text-xs text-gray-500 bg-gray-50">+ {items.length - 6} more</p>
      )}
    </div>
  )
}
