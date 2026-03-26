import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, Plus, MoreHorizontal, CheckCircle, ChevronDown, Pencil, Eye, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import Drawer from '../../components/ui/Drawer'
import FileUpload from '../../components/ui/FileUpload'
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'

// ── types ──────────────────────────────────────────────────────────────────────

type FuelType = 'Petrol' | 'Diesel'
type Status   = 'Pending' | 'Approved'
type DrawerMode = 'add' | 'edit'

interface FuelLog {
  id: number
  vehicleName: string
  vehicleNumber: string
  date: string
  driverName: string | null
  fuelType: FuelType
  quantity: number
  rate: number | null
  amount: number
  paidBy: 'Company' | 'Driver'
  receiptUrl: string | null
  notes: string | null
  status: Status
}

interface Vehicle {
  id: number
  modelName: string
  vehicleNumber: string
  fuelType: string | null
}

interface Driver {
  id: number
  name: string
}

const PAGE_SIZE = 8

// ── helpers ────────────────────────────────────────────────────────────────────

function isoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const [y, m, day] = dateStr.split('-')
  return `${m}/${day}/${y}`
}

function formatINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN')
}

function getPaginationPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, '...', total - 2, total - 1, total]
  if (current >= total - 2) return [1, 2, 3, '...', total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}

// ── row action menu ────────────────────────────────────────────────────────────

function RowMenu({ onEdit, onViewAll, onDelete }: { onEdit: () => void; onViewAll: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.right - 240 })
    setOpen(v => !v)
  }

  function menuItem(label: string, Icon: React.ElementType, onClick: () => void, destructive?: boolean) {
    return (
      <div className="px-1.5 py-px">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onClick(); setOpen(false) }}
          className={clsx(
            'w-full flex items-center gap-2 px-2.5 py-2.5 rounded-md text-sm font-medium text-left transition-colors cursor-pointer',
            destructive ? 'text-red-500 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50',
          )}
        >
          <Icon size={16} strokeWidth={1.75} className="shrink-0" />
          {label}
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <MoreHorizontal className="size-5" strokeWidth={1.75} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[9999] w-60 bg-white rounded-lg border border-gray-200 shadow-[0px_12px_16px_-4px_rgba(16,24,40,0.08),0px_4px_6px_-2px_rgba(16,24,40,0.03)] py-1"
        >
          {menuItem('Edit Fuel Expense', Pencil, onEdit)}
          {menuItem('See all car related fuel expense', Eye, onViewAll)}
          <div className="my-1 border-t border-gray-100" />
          {menuItem('Delete Fuel log', Trash2, onDelete, true)}
        </div>,
        document.body
      )}
    </>
  )
}

// ── form field ─────────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow bg-white disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default'

function Field({ label, required, children, error }: {
  label: string; required?: boolean; children: React.ReactNode; error?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-violet-600 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
    </div>
  )
}

// ── empty state ────────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="relative flex flex-col items-center justify-center py-20 overflow-hidden">
      <div className="absolute inset-0 opacity-50" style={{
        backgroundImage: 'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        WebkitMaskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, black 40%, transparent 100%)',
        maskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, black 40%, transparent 100%)',
      }} />
      <div className="relative flex flex-col items-center gap-4">
        <div className="size-20 rounded-full bg-gray-100 flex items-center justify-center">
          <div className="size-12 rounded-full bg-gray-700/60 flex items-center justify-center">
            <svg className="size-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-gray-900">No fuel logs found</p>
          <p className="mt-1 text-sm text-gray-500">Start by clicking the <strong>Add Fuel</strong> button above.</p>
        </div>
        <button type="button" onClick={onAdd}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors cursor-pointer">
          <Plus className="size-4" strokeWidth={2.5} />Add Fuel
        </button>
      </div>
    </div>
  )
}

// ── form default ───────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  vehicleId:     null as number | null,
  vehicleName:   '',
  vehicleNumber: '',
  date:          isoToday(),
  fuelType:      '' as FuelType | '',
  quantity:      '',
  amount:        '',
  paidBy:        'Company' as 'Company' | 'Driver',
  driverId:      null as number | null,
  driverName:    '',
  receiptUrl:    '' as string | null,
  notes:         '',
}

// ── page ───────────────────────────────────────────────────────────────────────

export default function FuelPage() {
  const { showToast } = useToast()

  const [rows,     setRows]     = useState<FuelLog[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [drivers,  setDrivers]  = useState<Driver[]>([])
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState<Status | 'All'>('All')
  const [page,     setPage]     = useState(1)

  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [drawerMode,    setDrawerMode]    = useState<DrawerMode>('add')
  const [activeLog,     setActiveLog]     = useState<FuelLog | null>(null)
  const [form,          setForm]          = useState(EMPTY_FORM)
  const [errors,        setErrors]        = useState<Record<string, string>>({})
  const [saving,        setSaving]        = useState(false)
  const [approving,     setApproving]     = useState<number | null>(null)
  const [deleteTarget,  setDeleteTarget]  = useState<FuelLog | null>(null)
  const [deleting,      setDeleting]      = useState(false)

  useEffect(() => {
    fetchData()
    supabase.from('vehicles').select('id, model_name, vehicle_number, fuel_type').order('model_name').then(({ data }) => {
      if (data) setVehicles(data.map((v: any) => ({ id: v.id, modelName: v.model_name, vehicleNumber: v.vehicle_number, fuelType: v.fuel_type })))
    })
    supabase.from('drivers').select('id, name').order('name').then(({ data }) => {
      if (data) setDrivers(data.map((d: any) => ({ id: d.id, name: d.name })))
    })
  }, [])

  async function fetchData() {
    const { data } = await supabase
      .from('fuel_logs')
      .select('id, vehicle_name, vehicle_number, date, driver_name, fuel_type, quantity, rate, amount, paid_by, receipt_url, notes, status')
      .order('created_at', { ascending: false })
    if (data) {
      setRows(data.map((r: any) => ({
        id:            r.id,
        vehicleName:   r.vehicle_name,
        vehicleNumber: r.vehicle_number,
        date:          r.date,
        driverName:    r.driver_name,
        fuelType:      r.fuel_type as FuelType,
        quantity:      Number(r.quantity),
        rate:          r.rate != null ? Number(r.rate) : null,
        amount:        Number(r.amount),
        paidBy:        r.paid_by as 'Company' | 'Driver',
        receiptUrl:    r.receipt_url,
        notes:         r.notes,
        status:        r.status as Status,
      })))
    }
  }

  // ── filtering & pagination ───────────────────────────────────────────────────

  const pendingCount = rows.filter(r => r.status === 'Pending').length

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q || r.vehicleName.toLowerCase().includes(q) || r.vehicleNumber.toLowerCase().includes(q)
    const matchStatus = filter === 'All' || r.status === filter
    return matchSearch && matchStatus
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── drawer helpers ───────────────────────────────────────────────────────────

  function logToForm(log: FuelLog): typeof EMPTY_FORM {
    const vehicle = vehicles.find(v => v.modelName === log.vehicleName && v.vehicleNumber === log.vehicleNumber)
    const driver  = log.driverName ? drivers.find(d => d.name === log.driverName) : undefined
    return {
      vehicleId:     vehicle?.id ?? null,
      vehicleName:   log.vehicleName,
      vehicleNumber: log.vehicleNumber,
      date:          log.date,
      fuelType:      log.fuelType,
      quantity:      String(log.quantity),
      amount:        String(log.amount),
      paidBy:        log.paidBy ?? 'Company',
      driverId:      driver?.id ?? null,
      driverName:    log.driverName ?? '',
      receiptUrl:    log.receiptUrl ?? null,
      notes:         log.notes ?? '',
    }
  }

  function openAdd() {
    setForm(EMPTY_FORM); setActiveLog(null); setDrawerMode('add'); setErrors({}); setDrawerOpen(true)
  }
  function openEdit(log: FuelLog) {
    setForm(logToForm(log)); setActiveLog(log); setDrawerMode('edit'); setErrors({}); setDrawerOpen(true)
  }

  function setField<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: '' }))
  }

  // ── save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    const errs: Record<string, string> = {}
    if (!form.vehicleId)                                errs.vehicleId = 'Vehicle is required'
    if (!form.quantity || isNaN(Number(form.quantity))) errs.quantity  = 'Valid quantity is required'
    if (!form.amount   || isNaN(Number(form.amount)))   errs.amount    = 'Valid amount is required'
    if (form.paidBy === 'Driver' && !form.driverId)     errs.driverId  = 'Select a driver'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)

    const payload = {
      vehicle_name:   form.vehicleName,
      vehicle_number: form.vehicleNumber,
      date:           form.date,
      fuel_type:      form.fuelType,
      quantity:       Number(form.quantity),
      rate:           null,
      amount:         Number(form.amount),
      paid_by:        form.paidBy,
      driver_name:    form.paidBy === 'Driver' ? (form.driverName || null) : null,
      receipt_url:    form.receiptUrl || null,
      notes:          form.notes || null,
      status:         'Approved' as Status,
    }

    if (drawerMode === 'add') {
      const { error } = await supabase.from('fuel_logs').insert(payload)
      if (!error) { await fetchData(); showToast('Fuel log added') }
      else { console.error('Fuel log insert error:', error); showToast('Error saving fuel log') }
    } else if (activeLog) {
      const { error } = await supabase.from('fuel_logs').update(payload).eq('id', activeLog.id)
      if (!error) { await fetchData(); showToast('Fuel log updated') }
      else { console.error('Fuel log update error:', error); showToast('Error updating fuel log') }
    }

    setSaving(false)
    setDrawerOpen(false)
  }

  // ── approve ──────────────────────────────────────────────────────────────────

  async function handleApprove(log: FuelLog) {
    setApproving(log.id)
    const { error } = await supabase.from('fuel_logs').update({ status: 'Approved' }).eq('id', log.id)
    if (!error) { await fetchData(); showToast('Fuel log approved') }
    setApproving(null)
  }

  // ── delete ───────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('fuel_logs').delete().eq('id', deleteTarget.id)
    if (!error) { await fetchData(); showToast('Fuel log deleted') }
    setDeleting(false)
    setDeleteTarget(null)
  }

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* Section header */}
      <div className="flex items-center justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Fuel</h2>
          <p className="mt-1 text-sm text-gray-500">Create and manage your vehicle fuel expenses here</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
            <input
              type="text"
              placeholder="Search by car"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-[38px] pr-3.5 py-2.5 w-64 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
            />
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-violet-700 transition-colors cursor-pointer"
          >
            <Plus className="size-4" strokeWidth={2.5} />Add Fuel
          </button>
        </div>
      </div>

      {/* All / Approved / Pending filter */}
      <div className="flex items-center gap-0.5 p-1 bg-gray-100 rounded-lg w-fit">
        {(['All', 'Approved', 'Pending'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => { setFilter(s); setPage(1) }}
            className={clsx(
              'relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer',
              filter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {s}
            {s === 'Pending' && pendingCount > 0 && (
              <span className="size-2 rounded-full bg-red-500 shrink-0" />
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="h-[44px] px-6 text-left text-xs font-medium text-gray-500 w-[241px] border-r border-gray-200">
                Vehicle Name and Number
              </th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-500">Date</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-500">Paid by</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-500">Fuel Type</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-500">Quantity</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-500">Rate</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-500">Amount</th>
              <th className="h-[44px] w-[108px]" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={8}><EmptyState onAdd={openAdd} /></td></tr>
            ) : pageRows.map(row => (
              <tr key={row.id} className="group border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors">
                <td className="h-[72px] px-6 py-4 border-r border-gray-200 w-[241px]">
                  <p className="text-sm font-medium text-gray-900">{row.vehicleName}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{row.vehicleNumber}</p>
                </td>
                <td className="px-4 py-4 text-sm text-gray-500">{formatDate(row.date)}</td>
                <td className="px-4 py-4 text-sm text-gray-500">
                  {row.paidBy === 'Driver' ? (row.driverName || '—') : 'Company'}
                </td>
                <td className="px-4 py-4 text-sm text-gray-500">{row.fuelType}</td>
                <td className="px-4 py-4 text-sm text-gray-500">{row.quantity}L</td>
                <td className="px-4 py-4 text-sm text-gray-500">
                  {row.quantity ? `₹${(row.amount / row.quantity).toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-4 text-sm text-gray-500">{formatINR(row.amount)}</td>
                <td className="px-3 py-4 w-[108px]">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Approve"
                      onClick={() => handleApprove(row)}
                      disabled={approving === row.id || row.status !== 'Pending'}
                      className={clsx(
                        'p-2 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors cursor-pointer disabled:cursor-default',
                        row.status === 'Pending' ? 'opacity-0 group-hover:opacity-100' : 'invisible',
                      )}
                    >
                      <CheckCircle className="size-5" strokeWidth={1.75} />
                    </button>
                    <RowMenu
                      onEdit={() => openEdit(row)}
                      onViewAll={() => { setSearch(row.vehicleName); setFilter('All'); setPage(1) }}
                      onDelete={() => setDeleteTarget(row)}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] cursor-pointer"
          >
            ← Previous
          </button>
          <div className="flex items-center gap-0.5">
            {getPaginationPages(page, totalPages).map((p, i) =>
              p === '...'
                ? <span key={`e${i}`} className="size-10 flex items-center justify-center text-sm text-gray-500">…</span>
                : <button key={p} onClick={() => setPage(p as number)}
                    className={clsx('size-10 rounded-lg text-sm font-medium cursor-pointer',
                      page === p ? 'bg-gray-100 text-gray-900 font-semibold' : 'text-gray-500 hover:bg-gray-50')}>
                    {p}
                  </button>
            )}
          </div>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] cursor-pointer"
          >
            Next →
          </button>
        </div>
      )}

      {/* Add / Edit Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'add' ? 'Add Fuel' : 'Edit Fuel Log'}
        description={drawerMode === 'add' ? 'Log a new fuel expense for a vehicle' : undefined}
        footer={
          <div className="flex justify-between gap-3">
            <button
              onClick={() => setDrawerOpen(false)}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-60 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] transition-colors cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-6">

          {/* Date — disabled, pre-filled */}
          <Field label="Date">
            <input
              type="date"
              className={inputCls}
              value={form.date}
              disabled
            />
          </Field>

          {/* Vehicle */}
          <Field label="Vehicle" required error={errors.vehicleId}>
            <div className="relative">
              <select
                className={clsx(inputCls, 'appearance-none pr-10', errors.vehicleId && 'border-red-400 focus:border-red-400 focus:ring-red-100')}
                value={form.vehicleId ?? ''}
                onChange={e => {
                  const v = vehicles.find(v => String(v.id) === e.target.value)
                  if (v) setForm(prev => ({ ...prev, vehicleId: v.id, vehicleName: v.modelName, vehicleNumber: v.vehicleNumber, fuelType: (v.fuelType as FuelType) || '' }))
                  else   setForm(prev => ({ ...prev, vehicleId: null, vehicleName: '', vehicleNumber: '', fuelType: '' }))
                  setErrors(prev => ({ ...prev, vehicleId: '' }))
                }}
              >
                <option value="">Select Vehicle</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.modelName} — {v.vehicleNumber}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" strokeWidth={1.75} />
            </div>
          </Field>

          {/* Quantity */}
          <Field label="Quantity (in litres)" required error={errors.quantity}>
            <input
              type="number" min="0" step="0.1"
              className={clsx(inputCls, errors.quantity && 'border-red-400 focus:border-red-400 focus:ring-red-100')}
              value={form.quantity}
              onChange={e => setField('quantity', e.target.value)}
              placeholder="e.g. 40"
            />
          </Field>

          {/* Amount */}
          <Field label="Amount (₹)" required error={errors.amount}>
            <input
              type="number" min="0"
              className={clsx(inputCls, errors.amount && 'border-red-400 focus:border-red-400 focus:ring-red-100')}
              value={form.amount}
              onChange={e => setField('amount', e.target.value)}
              placeholder="e.g. 3800"
            />
          </Field>

          {/* Paid by */}
          <Field label="Paid by" required>
            <div className="flex items-center gap-0.5 p-1 bg-gray-100 rounded-lg w-fit">
              {(['Company', 'Driver'] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setForm(prev => ({ ...prev, paidBy: opt, driverId: null, driverName: '' }))
                    setErrors(prev => ({ ...prev, driverId: '' }))
                  }}
                  className={clsx(
                    'px-3.5 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer',
                    form.paidBy === opt ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </Field>

          {/* Driver — shown only when Paid by Driver */}
          {form.paidBy === 'Driver' && (
            <Field label="Driver" required error={errors.driverId}>
              <div className="relative">
                <select
                  className={clsx(inputCls, 'appearance-none pr-10', errors.driverId && 'border-red-400 focus:border-red-400 focus:ring-red-100')}
                  value={form.driverId ?? ''}
                  onChange={e => {
                    const d = drivers.find(d => String(d.id) === e.target.value)
                    if (d) setForm(prev => ({ ...prev, driverId: d.id, driverName: d.name }))
                    else   setForm(prev => ({ ...prev, driverId: null, driverName: '' }))
                    setErrors(prev => ({ ...prev, driverId: '' }))
                  }}
                >
                  <option value="">Select Driver</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" strokeWidth={1.75} />
              </div>
            </Field>
          )}

          {/* Receipts */}
          <FileUpload
            label="Receipts"
            storagePath="fuel-receipts"
            existingUrl={form.receiptUrl}
            onChange={url => setForm(prev => ({ ...prev, receiptUrl: url }))}
          />

          {/* Notes */}
          <Field label="Notes">
            <textarea
              rows={3}
              className={clsx(inputCls, 'resize-none')}
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              placeholder="Add any additional notes…"
            />
          </Field>

        </div>
      </Drawer>

      {/* Delete confirm */}
      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Delete fuel log"
        description={deleteTarget ? `Delete the fuel log for ${deleteTarget.vehicleName} on ${formatDate(deleteTarget.date)}? This cannot be undone.` : ''}
        deleting={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
