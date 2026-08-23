import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { RotateCcw } from 'lucide-react'
import Toggle from '../../components/ui/Toggle'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'
import type { AllowanceCode, AllowanceUnit, Baseline } from '../../lib/allowances'

// The nine rows are seeded per company and their codes are wired into
// quantityFor() in lib/allowances.ts, so this page edits but never creates or
// deletes: a tenth code would have no trigger, and a deleted one would orphan
// every duty_allowances row that already references it. That is why there is
// no add button, no row menu and no pagination here.

interface Allowance {
  id: number
  code: AllowanceCode
  name: string
  unit: AllowanceUnit
  baseline: Baseline
  driverRate: number | null
  isActive: boolean
}

interface Draft {
  driverRate: string
  baseline: Baseline
  isActive: boolean
}

/** Mirrors quantityFor() in lib/allowances.ts. Change a trigger there and the
 *  wording here goes stale — they are meant to be read together. */
const TRIGGER: Record<AllowanceCode, string> = {
  daily:                'Every duty, for each day it runs',
  overtime:             'The duty closed later than it was scheduled to end',
  outstation:           'The duty type is categorised as outstation',
  outstation_overnight: 'An outstation duty that runs overnight',
  off_day:              "The duty starts on the driver's weekly off",
  early_start:          'The driver started before the scheduled reporting time',
  night:                'The duty runs past midnight into another day',
  extra_duty:           "The driver's second and any further duty that day",
  airport:              'An airport duty type, or a booking marked as an airport run',
}

const UNIT_LABEL: Record<AllowanceUnit, string> = {
  day: 'per day', hour: 'per hour', duty: 'per duty', night: 'per night',
}

/** Only these two measure against a clock, so only these two read `baseline`. */
const USES_BASELINE: AllowanceCode[] = ['overtime', 'early_start']

const BASELINE_LABEL: Record<Baseline, string> = {
  duty_window:  "The duty's scheduled times",
  driver_shift: "The driver's shift times",
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg shadow-xs text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow bg-white'

function toDraft(a: Allowance): Draft {
  return {
    driverRate: a.driverRate != null ? String(a.driverRate) : '',
    baseline:   a.baseline,
    isActive:   a.isActive,
  }
}

function isDirty(a: Allowance, d: Draft): boolean {
  const rate = d.driverRate.trim() === '' ? null : Number(d.driverRate)
  return rate !== a.driverRate || d.baseline !== a.baseline || d.isActive !== a.isActive
}

export default function AllowancesPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<Allowance[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchAllowances() }, [])

  async function fetchAllowances() {
    const { data, error } = await supabase
      .from('allowances')
      .select('id, code, name, unit, baseline, driver_rate, is_active')
      .order('id')

    if (error) {
      console.error('[allowances] load', error.message)
      showToast('Could not load allowances')
      setLoading(false)
      return
    }

    const mapped: Allowance[] = (data ?? []).map((r: any) => ({
      id:         r.id,
      code:       r.code,
      name:       r.name,
      unit:       r.unit,
      baseline:   r.baseline,
      driverRate: r.driver_rate != null ? Number(r.driver_rate) : null,
      isActive:   r.is_active,
    }))
    setRows(mapped)
    setDrafts(Object.fromEntries(mapped.map(a => [a.id, toDraft(a)])))
    setLoading(false)
  }

  function set<K extends keyof Draft>(id: number, key: K, value: Draft[K]) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [key]: value } }))
  }

  const changed = rows.filter(a => drafts[a.id] && isDirty(a, drafts[a.id]))

  function reset() {
    setDrafts(Object.fromEntries(rows.map(a => [a.id, toDraft(a)])))
  }

  async function handleSave() {
    setSaving(true)
    // At most nine rows, and usually one or two — a loop of updates is cheaper
    // to read than an upsert that has to restate the immutable company_id.
    for (const a of changed) {
      const d = drafts[a.id]
      const { error } = await supabase
        .from('allowances')
        .update({
          driver_rate: d.driverRate.trim() === '' ? null : Number(d.driverRate),
          baseline:    d.baseline,
          is_active:   d.isActive,
        })
        .eq('id', a.id)

      if (error) {
        console.error('[allowances] save', error.message)
        showToast(`Could not save ${a.name}`)
        setSaving(false)
        return
      }
    }
    await fetchAllowances()
    setSaving(false)
    showToast(`${changed.length} allowance${changed.length > 1 ? 's' : ''} updated`)
  }

  const unpriced = rows.filter(a => a.isActive && a.driverRate == null).length

  return (
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Allowances</h1>
          <p className="mt-1 text-sm text-gray-500">
            What each allowance pays the driver. What the customer is charged is set
            per duty type, and is billed only where you price it there.
          </p>
        </div>
      </div>

      {unpriced > 0 && !loading && (
        <div className="flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-25 px-4 py-3">
          <p className="text-sm text-warning-700">
            <span className="font-medium">
              {unpriced} active allowance{unpriced > 1 ? 's have' : ' has'} no driver rate.
            </span>{' '}
            {unpriced > 1 ? 'They' : 'It'} will be calculated on every duty and pay nothing
            until a rate is set.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="h-[44px] px-6 text-left text-xs font-medium text-gray-600">Allowance</th>
              <th className="h-[44px] px-6 text-left text-xs font-medium text-gray-600 w-[132px]">Counted</th>
              <th className="h-[44px] px-6 text-left text-xs font-medium text-gray-600 w-[168px]">Driver rate</th>
              <th className="h-[44px] px-6 text-left text-xs font-medium text-gray-600 w-[232px]">Measured against</th>
              <th className="h-[44px] px-6 text-left text-xs font-medium text-gray-600 w-[104px]">Active</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="h-[120px] px-6 text-center text-sm text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="h-[120px] px-6 text-center text-sm text-gray-400">
                No allowances found for this company.
              </td></tr>
            ) : rows.map(a => {
              const d = drafts[a.id]
              if (!d) return null
              const dim = !d.isActive
              return (
                <tr key={a.id} className="border-b border-gray-200 last:border-b-0">
                  <td className="px-6 py-4">
                    <p className={clsx('text-sm font-medium', dim ? 'text-gray-400' : 'text-gray-900')}>
                      {a.name}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">{TRIGGER[a.code]}</p>
                  </td>

                  <td className="px-6 py-4">
                    <span className="inline-block px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-xs font-medium text-gray-600 whitespace-nowrap">
                      {UNIT_LABEL[a.unit]}
                    </span>
                  </td>

                  <td className="px-6 py-4">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">₹</span>
                      <input
                        type="number" min="0" step="0.01" placeholder="0.00"
                        value={d.driverRate}
                        onChange={e => set(a.id, 'driverRate', e.target.value)}
                        aria-label={`${a.name} driver rate`}
                        className={clsx(inputCls, 'pl-7 tabular-nums')}
                      />
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    {USES_BASELINE.includes(a.code) ? (
                      <select
                        value={d.baseline}
                        onChange={e => set(a.id, 'baseline', e.target.value as Baseline)}
                        aria-label={`${a.name} baseline`}
                        className={clsx(inputCls, 'cursor-pointer')}
                      >
                        <option value="duty_window">{BASELINE_LABEL.duty_window}</option>
                        <option value="driver_shift">{BASELINE_LABEL.driver_shift}</option>
                      </select>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>

                  <td className="px-6 py-4">
                    <Toggle
                      checked={d.isActive}
                      onChange={() => set(a.id, 'isActive', !d.isActive)}
                      label={`${a.name} active`}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Switching an allowance off stops it applying to drivers and customers alike.
        Amounts already saved against a completed duty are never recalculated.
      </p>

      {/* Save bar — only present when there is something to save */}
      {changed.length > 0 && (
        <div className="sticky bottom-6 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3.5 shadow-lg">
          <p className="flex-1 text-sm text-gray-700">
            <span className="font-medium">{changed.length} unsaved change{changed.length > 1 ? 's' : ''}</span>
            <span className="text-gray-500"> · {changed.map(a => a.name).join(', ')}</span>
          </p>
          <button
            onClick={reset} disabled={saving}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 shadow-xs hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="size-4" strokeWidth={1.75} />Discard
          </button>
          <button
            onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg shadow-xs hover:bg-violet-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  )
}
