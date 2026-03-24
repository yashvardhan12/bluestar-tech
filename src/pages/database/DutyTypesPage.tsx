import { useState, useRef, useEffect } from 'react'
import { Search, Plus, Trash2, MoreHorizontal, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import Drawer from '../../components/ui/Drawer'
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'

// ── types ─────────────────────────────────────────────────────────────────────

type Category = 'Airport' | 'Hourly' | 'Outstation' | 'Monthly'
type DrawerMode = 'add' | 'view' | 'edit'

interface DutyType {
  id: number
  category: Category
  typeName: string
  vehicleGroupId: number | null
  vehicleGroupName: string
  fixedCharges: number | null
  nightCharges: number | null
  thresholdKm: number | null
  rate0to6Hrs: number | null
  rate6to12Hrs: number | null
  rate12PlusHrs: number | null
  ratePerKm: number | null
  dailyOutstationCharges: number | null
  isP2P: boolean
  isGTG: boolean
}

const CATEGORIES: Category[] = ['Airport', 'Hourly', 'Outstation', 'Monthly']
const PAGE_SIZE = 8

// ── helpers ───────────────────────────────────────────────────────────────────

function getPaginationPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, '...', total - 2, total - 1, total]
  if (current >= total - 2) return [1, 2, 3, '...', total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}

function IndeterminateCheckbox({ checked, indeterminate, onChange }: {
  checked: boolean; indeterminate: boolean; onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return (
    <input ref={ref} type="checkbox" checked={checked} onChange={onChange}
      className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer" />
  )
}

// ── drawer field helpers ──────────────────────────────────────────────────────

const inputCls = 'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow bg-white disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default'

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {required && <span className="text-violet-600">*</span>}
        {hint && (
          <span title={hint} className="size-4 flex items-center justify-center rounded-full border border-gray-300 text-gray-400 text-[10px] font-bold cursor-help">?</span>
        )}
      </div>
      {children}
    </div>
  )
}

function SelectField({ label, required, value, onChange, placeholder, options, disabled }: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void
  placeholder: string; options: { value: string; label: string }[]; disabled?: boolean
}) {
  return (
    <Field label={label} required={required}>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
          className={clsx(inputCls, 'appearance-none pr-9', disabled ? 'cursor-default' : 'cursor-pointer', !value && 'text-gray-400')}>
          <option value="">{placeholder}</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
      </div>
    </Field>
  )
}

function NumericField({ label, required, placeholder, value, onChange, disabled }: {
  label: string; required?: boolean; placeholder?: string
  value: string; onChange: (v: string) => void; disabled?: boolean
}) {
  return (
    <Field label={label} required={required}>
      <input type="number" placeholder={placeholder ?? '150'} value={value}
        onChange={e => onChange(e.target.value)} disabled={disabled} className={inputCls} />
    </Field>
  )
}

function RadioOption({ label, description, checked, onChange, disabled }: {
  label: string; description: string; checked: boolean; onChange: () => void; disabled?: boolean
}) {
  return (
    <label className={clsx('flex items-start gap-3 cursor-pointer', disabled && 'cursor-default')}>
      <div className={clsx(
        'mt-0.5 size-4 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
        checked ? 'border-violet-600 bg-violet-600' : 'border-gray-300 bg-white',
      )} onClick={() => !disabled && onChange()}>
        {checked && <div className="size-1.5 rounded-full bg-white" />}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
    </label>
  )
}

// ── form state ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  category: '' as Category | '',
  typeName: '',
  vehicleGroupId: '',
  fixedCharges: '',
  nightCharges: '',
  thresholdKm: '',
  rate0to6Hrs: '',
  rate6to12Hrs: '',
  rate12PlusHrs: '',
  ratePerKm: '',
  dailyOutstationCharges: '',
  isP2P: false,
  isGTG: false,
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function DutyTypesPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<DutyType[]>([])
  const [vehicleGroups, setVehicleGroups] = useState<{ id: number; name: string }[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('add')
  const [activeRow, setActiveRow] = useState<DutyType | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<DutyType | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [dtRes, vgRes] = await Promise.all([
      supabase.from('duty_types')
        .select('id, category, type_name, vehicle_group_id, fixed_charges, night_charges, threshold_km, rate_0_6_hrs, rate_6_12_hrs, rate_12_plus_hrs, rate_per_km, daily_outstation_charges, is_p2p, is_gtg, vehicle_groups(name)')
        .order('created_at', { ascending: false }),
      supabase.from('vehicle_groups').select('id, name').order('name'),
    ])
    if (vgRes.data) setVehicleGroups(vgRes.data)
    if (dtRes.data) {
      setRows(dtRes.data.map((d: any) => ({
        id: d.id,
        category: d.category as Category,
        typeName: d.type_name,
        vehicleGroupId: d.vehicle_group_id,
        vehicleGroupName: d.vehicle_groups?.name ?? '—',
        fixedCharges: d.fixed_charges,
        nightCharges: d.night_charges,
        thresholdKm: d.threshold_km,
        rate0to6Hrs: d.rate_0_6_hrs,
        rate6to12Hrs: d.rate_6_12_hrs,
        rate12PlusHrs: d.rate_12_plus_hrs,
        ratePerKm: d.rate_per_km,
        dailyOutstationCharges: d.daily_outstation_charges,
        isP2P: d.is_p2p,
        isGTG: d.is_gtg,
      })))
    }
  }

  // ── filtering ─────────────────────────────────────────────────────────────

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    return !q || r.typeName.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || r.vehicleGroupName.toLowerCase().includes(q)
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const allSelected = pageRows.length > 0 && pageRows.every(r => selected.has(r.id))
  const someSelected = pageRows.some(r => selected.has(r.id)) && !allSelected

  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) pageRows.forEach(r => next.delete(r.id))
      else pageRows.forEach(r => next.add(r.id))
      return next
    })
  }
  function toggleRow(id: number) {
    setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  // ── drawer helpers ────────────────────────────────────────────────────────

  function rowToForm(r: DutyType): typeof EMPTY_FORM {
    return {
      category: r.category,
      typeName: r.typeName,
      vehicleGroupId: r.vehicleGroupId ? String(r.vehicleGroupId) : '',
      fixedCharges: r.fixedCharges != null ? String(r.fixedCharges) : '',
      nightCharges: r.nightCharges != null ? String(r.nightCharges) : '',
      thresholdKm: r.thresholdKm != null ? String(r.thresholdKm) : '',
      rate0to6Hrs: r.rate0to6Hrs != null ? String(r.rate0to6Hrs) : '',
      rate6to12Hrs: r.rate6to12Hrs != null ? String(r.rate6to12Hrs) : '',
      rate12PlusHrs: r.rate12PlusHrs != null ? String(r.rate12PlusHrs) : '',
      ratePerKm: r.ratePerKm != null ? String(r.ratePerKm) : '',
      dailyOutstationCharges: r.dailyOutstationCharges != null ? String(r.dailyOutstationCharges) : '',
      isP2P: r.isP2P,
      isGTG: r.isGTG,
    }
  }

  function openAdd() { setForm(EMPTY_FORM); setActiveRow(null); setDrawerMode('add'); setDrawerOpen(true) }
  function openView(r: DutyType) { setForm(rowToForm(r)); setActiveRow(r); setDrawerMode('view'); setDrawerOpen(true) }
  function openEdit(r: DutyType) { setForm(rowToForm(r)); setActiveRow(r); setDrawerMode('edit'); setDrawerOpen(true) }

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // ── save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.category || !form.typeName.trim()) return
    setSaving(true)

    const payload = {
      category: form.category,
      type_name: form.typeName.trim(),
      vehicle_group_id: form.vehicleGroupId ? Number(form.vehicleGroupId) : null,
      fixed_charges: form.fixedCharges ? Number(form.fixedCharges) : null,
      night_charges: form.nightCharges ? Number(form.nightCharges) : null,
      threshold_km: form.thresholdKm ? Number(form.thresholdKm) : null,
      rate_0_6_hrs: form.rate0to6Hrs ? Number(form.rate0to6Hrs) : null,
      rate_6_12_hrs: form.rate6to12Hrs ? Number(form.rate6to12Hrs) : null,
      rate_12_plus_hrs: form.rate12PlusHrs ? Number(form.rate12PlusHrs) : null,
      rate_per_km: form.ratePerKm ? Number(form.ratePerKm) : null,
      daily_outstation_charges: form.dailyOutstationCharges ? Number(form.dailyOutstationCharges) : null,
      is_p2p: form.isP2P,
      is_gtg: form.isGTG,
    }

    if (drawerMode === 'add') {
      const { error } = await supabase.from('duty_types').insert(payload)
      if (!error) { await fetchData(); showToast('Duty type added successfully') }
    } else if (drawerMode === 'edit' && activeRow) {
      const { error } = await supabase.from('duty_types').update(payload).eq('id', activeRow.id)
      if (!error) { await fetchData(); showToast('Duty type updated successfully') }
    }

    setSaving(false)
    setDrawerOpen(false)
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('duty_types').delete().eq('id', deleteTarget.id)
    if (!error) {
      setSelected(prev => { const next = new Set(prev); next.delete(deleteTarget.id); return next })
      await fetchData()
      showToast('Duty type deleted successfully')
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  const readOnly = drawerMode === 'view'
  const cat = form.category

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* Header */}
      <div className="border-b border-gray-200 pb-5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-semibold leading-[38px] text-gray-900">Duty types</h2>
          <p className="text-base font-normal text-gray-500 leading-6">Create and manage your duty types here</p>
        </div>
        <div className="relative w-[400px] shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-gray-400 pointer-events-none" strokeWidth={1.75} />
          <input type="text" placeholder="Search by duty type" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-[42px] pr-3.5 py-2.5 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-base text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow" />
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 px-3.5 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] cursor-pointer hover:bg-violet-700 transition-colors shrink-0">
          <Plus className="size-5" strokeWidth={2} />
          Add duty type
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <IndeterminateCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
                  <button className="flex items-center gap-1 text-xs font-medium text-gray-600 cursor-pointer hover:text-gray-900 transition-colors">
                    Name <ChevronDown className="size-4 shrink-0" strokeWidth={1.75} />
                  </button>
                </div>
              </th>
              <th className="h-[44px] px-6 text-left border-b border-gray-200 w-[180px]">
                <span className="text-xs font-medium text-gray-600">Category</span>
              </th>
              <th className="h-[44px] px-6 text-left border-b border-gray-200 w-[220px]">
                <span className="text-xs font-medium text-gray-600">Vehicle Group</span>
              </th>
              <th className="h-[44px] w-[68px] border-b border-gray-200" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(row => (
              <tr key={row.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors">
                <td className="h-[72px] px-6 py-4">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)}
                      className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer" />
                    <span className="text-sm font-medium text-gray-900">{row.typeName}</span>
                  </div>
                </td>
                <td className="h-[72px] px-6 py-4 text-sm text-gray-500">{row.category}</td>
                <td className="h-[72px] px-6 py-4 text-sm text-gray-500">{row.vehicleGroupName}</td>
                <td className="h-[72px] p-4" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setDeleteTarget(row)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 transition-colors cursor-pointer">
                      <Trash2 className="size-5" strokeWidth={1.75} />
                    </button>
                    <div className="relative group">
                      <button className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer peer">
                        <MoreHorizontal className="size-5" strokeWidth={1.75} />
                      </button>
                      <RowMenu onView={() => openView(row)} onEdit={() => openEdit(row)} />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={4} className="py-16 text-center text-sm text-gray-400">
                {search ? 'No duty types match your search.' : 'No duty types yet. Click "Add duty type" to create one.'}
              </td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="border-t border-gray-200 flex items-center justify-between px-6 pt-3 pb-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
            <ChevronLeft className="size-5" strokeWidth={1.75} /> Previous
          </button>
          <div className="flex items-center gap-0.5">
            {getPaginationPages(page, totalPages).map((p, i) => (
              <button key={i} onClick={() => typeof p === 'number' && setPage(p)} disabled={p === '...'}
                className={clsx('size-10 rounded-lg text-sm font-medium flex items-center justify-center transition-colors',
                  p === page ? 'bg-gray-50 text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-50',
                  p === '...' && 'cursor-default pointer-events-none')}>
                {p}
              </button>
            ))}
          </div>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
            Next <ChevronRight className="size-5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'add' ? 'New Duty Type' : drawerMode === 'edit' ? 'Edit Duty Type' : 'View Duty Type'}
        description="Add details of your duty type"
        footer={
          readOnly ? (
            <button type="button" onClick={() => setDrawerOpen(false)}
              className="flex-1 h-10 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
              Close
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setDrawerOpen(false)}
                className="flex-1 h-10 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving || !form.category || !form.typeName.trim()}
                className="flex-1 h-10 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? 'Saving…' : drawerMode === 'add' ? 'Save' : 'Save Changes'}
              </button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-5">

          {/* Category — always visible first */}
          <SelectField
            label="Category" required={!readOnly}
            value={form.category}
            onChange={v => set('category', v as Category)}
            placeholder="Select category"
            options={CATEGORIES.map(c => ({ value: c, label: c }))}
            disabled={readOnly}
          />

          {/* Dynamic fields — only shown after category is selected */}
          {cat && (
            <>
              <Field label="Type Name" required={!readOnly}>
                <input type="text" placeholder="Enter type name" value={form.typeName}
                  onChange={e => set('typeName', e.target.value)} disabled={readOnly} className={inputCls} />
              </Field>

              <SelectField
                label="Category - Vehicle Group" required={!readOnly}
                value={form.vehicleGroupId}
                onChange={v => set('vehicleGroupId', v)}
                placeholder="Select Vehicle Group"
                options={vehicleGroups.map(g => ({ value: String(g.id), label: g.name }))}
                disabled={readOnly}
              />

              {/* Airport fields */}
              {cat === 'Airport' && (
                <>
                  <NumericField label="Fixed Charges" required={!readOnly} value={form.fixedCharges} onChange={v => set('fixedCharges', v)} disabled={readOnly} />
                  <NumericField label="Night Charges" required={!readOnly} value={form.nightCharges} onChange={v => set('nightCharges', v)} disabled={readOnly} />
                </>
              )}

              {/* Hourly fields */}
              {cat === 'Hourly' && (
                <>
                  <NumericField label="Threshold KMs" required={!readOnly} value={form.thresholdKm} onChange={v => set('thresholdKm', v)} disabled={readOnly} />

                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-gray-700">
                      Define rates basis hours if total duty kilometers are less than threshold kilometers
                      <span className="text-violet-600"> *</span>
                    </p>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="grid grid-cols-2 bg-gray-50 border-b border-gray-200 px-4 py-2">
                        <span className="text-xs font-medium text-gray-500">Hours</span>
                        <span className="text-xs font-medium text-gray-500 text-right">Base Rate</span>
                      </div>
                      {[
                        { label: '0 - 6 hours',  key: 'rate0to6Hrs'   as const },
                        { label: '6 - 12 hours', key: 'rate6to12Hrs'  as const },
                        { label: '12+ hours',    key: 'rate12PlusHrs' as const },
                      ].map(row => (
                        <div key={row.key} className="grid grid-cols-2 items-center px-4 py-3 border-b border-gray-100 last:border-b-0">
                          <span className="text-sm text-gray-700">{row.label}</span>
                          <input
                            type="number" placeholder="0" value={form[row.key]}
                            onChange={e => set(row.key, e.target.value)}
                            disabled={readOnly}
                            className="w-24 ml-auto px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-right text-violet-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-50 disabled:cursor-default"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1.5">
                      Define rates basis kilometers if total kilometers are more than threshold kilometers
                      <span className="text-violet-600"> *</span>
                    </p>
                    <NumericField label="Rate per kilometer" required={!readOnly} value={form.ratePerKm} onChange={v => set('ratePerKm', v)} disabled={readOnly} />
                  </div>
                </>
              )}

              {/* Outstation fields */}
              {cat === 'Outstation' && (
                <>
                  <NumericField label="Rate per kilometer" required={!readOnly} value={form.ratePerKm} onChange={v => set('ratePerKm', v)} disabled={readOnly} />
                  <NumericField label="Daily outstation charges" required={!readOnly} value={form.dailyOutstationCharges} onChange={v => set('dailyOutstationCharges', v)} disabled={readOnly} />
                </>
              )}

              {/* Monthly fields */}
              {cat === 'Monthly' && (
                <>
                  <NumericField label="Fixed Charges" required={!readOnly} value={form.fixedCharges} onChange={v => set('fixedCharges', v)} disabled={readOnly} />
                  <NumericField label="Rate per kilometer" required={!readOnly} value={form.ratePerKm} onChange={v => set('ratePerKm', v)} disabled={readOnly} />
                  <NumericField label="Daily outstation charges" required={!readOnly} value={form.dailyOutstationCharges} onChange={v => set('dailyOutstationCharges', v)} disabled={readOnly} />
                </>
              )}

              {/* P2P / GTG — all categories */}
              <div className="flex flex-col gap-3 pt-1">
                <RadioOption
                  label="Is Point to Point (P2P)?"
                  description="Charge is fixed from pickup to drop, regardless of distance."
                  checked={form.isP2P}
                  onChange={() => set('isP2P', !form.isP2P)}
                  disabled={readOnly}
                />
                <RadioOption
                  label="Is Garage to Garage (GTG)?"
                  description="Charge includes travel from and back to garage."
                  checked={form.isGTG}
                  onChange={() => set('isGTG', !form.isGTG)}
                  disabled={readOnly}
                />
              </div>
            </>
          )}
        </div>
      </Drawer>

      <ConfirmDeleteModal
        open={deleteTarget !== null}
        title="Delete duty type"
        description={deleteTarget ? `Are you sure you want to delete "${deleteTarget.typeName}"? This action cannot be undone.` : ''}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </div>
  )
}

// ── row menu (outside page to avoid re-declaration) ───────────────────────────

function RowMenu({ onView, onEdit }: { onView: () => void; onEdit: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer">
        <MoreHorizontal className="size-5" strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-36 bg-white rounded-lg border border-gray-200 shadow-[0px_8px_16px_-4px_rgba(16,24,40,0.08)] py-1">
          <button type="button" onClick={() => { onView(); setOpen(false) }}
            className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 cursor-pointer">View</button>
          <button type="button" onClick={() => { onEdit(); setOpen(false) }}
            className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 cursor-pointer">Edit</button>
        </div>
      )}
    </div>
  )
}
