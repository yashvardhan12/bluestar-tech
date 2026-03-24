import { useState, useRef, useEffect } from 'react'
import { Search, Plus, Trash2, MoreHorizontal, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import Drawer from '../../components/ui/Drawer'
import FileUpload from '../../components/ui/FileUpload'
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'

// ── types ─────────────────────────────────────────────────────────────────────

type DriverStatus = 'Active' | 'Inactive' | 'Available' | 'Assigned' | 'Unavailable'
type DrawerMode = 'add' | 'view' | 'edit'

interface Driver {
  id: number
  name: string
  initials: string
  driverId: string
  phone: string | null
  email: string | null
  status: DriverStatus
  // Extended fields
  dateOfBirth: string | null
  panNumber: string | null
  aadhaarNumber: string | null
  driverLicense: string | null
  addressType: string | null
  address: string | null
  salaryPerMonth: string | null
  dailyWages: string | null
  shiftStartTime: string | null
  shiftEndTime: string | null
  offDay: string | null
  attachDocumentUrl: string | null
  notes: string | null
}

const PAGE_SIZE = 8

// ── helpers ───────────────────────────────────────────────────────────────────

function getPaginationPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, '...', total - 2, total - 1, total]
  if (current >= total - 2) return [1, 2, 3, '...', total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function computeWorkingHours(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  return mins > 0 ? Math.round(mins / 6) / 10 : 0
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

// ── status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DriverStatus }) {
  const map: Record<DriverStatus, { dot: string; text: string; bg: string }> = {
    Active:      { dot: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50'  },
    Available:   { dot: 'bg-pink-500',   text: 'text-pink-700',   bg: 'bg-pink-50'   },
    Assigned:    { dot: 'bg-blue-500',   text: 'text-blue-700',   bg: 'bg-blue-50'   },
    Inactive:    { dot: 'bg-gray-400',   text: 'text-gray-500',   bg: 'bg-gray-100'  },
    Unavailable: { dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50'    },
  }
  const s = map[status]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', s.bg, s.text)}>
      <span className={clsx('size-1.5 rounded-full shrink-0', s.dot)} />
      {status}
    </span>
  )
}

// ── avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
]

function Avatar({ initials, index }: { initials: string; index: number }) {
  return (
    <span className={clsx('size-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0', AVATAR_COLORS[index % AVATAR_COLORS.length])}>
      {initials}
    </span>
  )
}

// ── row menu ──────────────────────────────────────────────────────────────────

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
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer">
        <MoreHorizontal className="size-5" strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-40 bg-white rounded-lg border border-gray-200 shadow-[0px_8px_16px_-4px_rgba(16,24,40,0.08)] py-1">
          <button type="button" onClick={() => { onView(); setOpen(false) }}
            className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 cursor-pointer">View</button>
          <button type="button" onClick={() => { onEdit(); setOpen(false) }}
            className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 cursor-pointer">Edit</button>
        </div>
      )}
    </div>
  )
}

// ── drawer field helpers ──────────────────────────────────────────────────────

const inputCls = 'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow bg-white disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-0.5 text-sm font-medium text-gray-700">
        {label}{required && <span className="text-violet-600">*</span>}
      </label>
      {children}
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-4">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {children}
    </div>
  )
}

// ── form state ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  dateOfBirth: '',
  panNumber: '',
  aadhaarNumber: '',
  driverLicense: '',
  addressType: 'Permanent Address',
  address: '',
  salaryPerMonth: '',
  dailyWages: '',
  shiftStartTime: '',
  shiftEndTime: '',
  offDay: 'Sunday',
  attachDocumentUrl: '',
  status: 'Active' as DriverStatus,
  notes: '',
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyState({ isFiltered, onAdd }: { isFiltered: boolean; onAdd: () => void }) {
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
          <div className="size-12 rounded-full bg-gray-700/60 backdrop-blur-sm flex items-center justify-center">
            <svg className="size-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-gray-900">No drivers found</p>
          <p className="mt-1 text-sm text-gray-500">
            {isFiltered ? 'No drivers match your search.' : <>There are no drivers yet. Start by clicking the <strong>Add driver</strong> button above.</>}
          </p>
        </div>
        {isFiltered && (
          <button type="button" onClick={onAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors cursor-pointer">
            <Plus className="size-4" strokeWidth={2.5} />Add driver
          </button>
        )}
      </div>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function DriversPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<Driver[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('add')
  const [activeDriver, setActiveDriver] = useState<Driver | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Driver | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data } = await supabase
      .from('drivers')
      .select('id, name, initials, driver_id, phone, email, status, date_of_birth, pan_number, aadhaar_number, driver_license, address_type, address, salary_per_month, daily_wages, shift_start_time, shift_end_time, off_day, attach_document_url, notes')
      .order('created_at', { ascending: false })
    if (data) {
      setRows(data.map((d: any) => ({
        id: d.id,
        name: d.name,
        initials: d.initials,
        driverId: d.driver_id,
        phone: d.phone,
        email: d.email,
        status: d.status as DriverStatus,
        dateOfBirth: d.date_of_birth,
        panNumber: d.pan_number,
        aadhaarNumber: d.aadhaar_number,
        driverLicense: d.driver_license,
        addressType: d.address_type,
        address: d.address,
        salaryPerMonth: d.salary_per_month != null ? String(d.salary_per_month) : null,
        dailyWages: d.daily_wages != null ? String(d.daily_wages) : null,
        shiftStartTime: d.shift_start_time,
        shiftEndTime: d.shift_end_time,
        offDay: d.off_day,
        attachDocumentUrl: d.attach_document_url,
        notes: d.notes,
      })))
    }
  }

  // ── filtering & pagination ────────────────────────────────────────────────

  const filtered = rows.filter(d => {
    const q = search.toLowerCase()
    return !q || d.name.toLowerCase().includes(q) || (d.phone ?? '').toLowerCase().includes(q)
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

  function driverToForm(d: Driver): typeof EMPTY_FORM {
    return {
      name: d.name,
      phone: d.phone ?? '',
      email: d.email ?? '',
      dateOfBirth: d.dateOfBirth ?? '',
      panNumber: d.panNumber ?? '',
      aadhaarNumber: d.aadhaarNumber ?? '',
      driverLicense: d.driverLicense ?? '',
      addressType: d.addressType ?? 'Permanent Address',
      address: d.address ?? '',
      salaryPerMonth: d.salaryPerMonth ?? '',
      dailyWages: d.dailyWages ?? '',
      shiftStartTime: d.shiftStartTime ?? '',
      shiftEndTime: d.shiftEndTime ?? '',
      offDay: d.offDay ?? 'Sunday',
      attachDocumentUrl: d.attachDocumentUrl ?? '',
      status: d.status,
      notes: d.notes ?? '',
    }
  }

  function openAdd() {
    setForm(EMPTY_FORM); setActiveDriver(null); setDrawerMode('add'); setDrawerOpen(true)
  }
  function openView(d: Driver) {
    setForm(driverToForm(d)); setActiveDriver(d); setDrawerMode('view'); setDrawerOpen(true)
  }
  function openEdit(d: Driver) {
    setForm(driverToForm(d)); setActiveDriver(d); setDrawerMode('edit'); setDrawerOpen(true)
  }

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // ── save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)

    const initials = getInitials(form.name)
    const payload = {
      name: form.name.trim(),
      initials,
      phone: form.phone || null,
      email: form.email || null,
      status: form.status,
      date_of_birth: form.dateOfBirth || null,
      pan_number: form.panNumber || null,
      aadhaar_number: form.aadhaarNumber || null,
      driver_license: form.driverLicense || null,
      address_type: form.addressType || null,
      address: form.address || null,
      salary_per_month: form.salaryPerMonth ? Number(form.salaryPerMonth) : null,
      daily_wages: form.dailyWages ? Number(form.dailyWages) : null,
      shift_start_time: form.shiftStartTime || null,
      shift_end_time: form.shiftEndTime || null,
      off_day: form.offDay || null,
      attach_document_url: form.attachDocumentUrl || null,
      notes: form.notes || null,
    }

    if (drawerMode === 'add') {
      const { data: last } = await supabase.from('drivers').select('driver_id').order('created_at', { ascending: false }).limit(1)
      const lastNum = last?.[0]?.driver_id ? parseInt(last[0].driver_id.replace(/\D/g, '')) : 0
      const nextId = `BLUDRIVER${String(lastNum + 1).padStart(2, '0')}`

      const { data, error } = await supabase
        .from('drivers')
        .insert({ ...payload, driver_id: nextId })
        .select()
        .single()

      if (!error && data) {
        setRows(prev => [{
          id: data.id, name: data.name, initials: data.initials, driverId: data.driver_id,
          phone: data.phone, email: data.email, status: data.status,
          dateOfBirth: data.date_of_birth, panNumber: data.pan_number,
          aadhaarNumber: data.aadhaar_number, driverLicense: data.driver_license,
          addressType: data.address_type, address: data.address,
          salaryPerMonth: data.salary_per_month != null ? String(data.salary_per_month) : null,
          dailyWages: data.daily_wages != null ? String(data.daily_wages) : null,
          shiftStartTime: data.shift_start_time, shiftEndTime: data.shift_end_time,
          offDay: data.off_day, attachDocumentUrl: data.attach_document_url, notes: data.notes,
        }, ...prev])
        showToast('Driver added successfully')
      }
    } else if (drawerMode === 'edit' && activeDriver) {
      const { error } = await supabase.from('drivers').update(payload).eq('id', activeDriver.id)
      if (!error) {
        setRows(prev => prev.map(d => d.id === activeDriver.id ? {
          ...d, ...{
            name: form.name.trim(), initials, phone: form.phone || null,
            email: form.email || null, status: form.status,
            dateOfBirth: form.dateOfBirth || null, panNumber: form.panNumber || null,
            aadhaarNumber: form.aadhaarNumber || null, driverLicense: form.driverLicense || null,
            addressType: form.addressType || null, address: form.address || null,
            salaryPerMonth: form.salaryPerMonth || null, dailyWages: form.dailyWages || null,
            shiftStartTime: form.shiftStartTime || null, shiftEndTime: form.shiftEndTime || null,
            offDay: form.offDay || null, attachDocumentUrl: form.attachDocumentUrl || null,
            notes: form.notes || null,
          },
        } : d))
        showToast('Driver updated successfully')
      }
    }

    setSaving(false)
    setDrawerOpen(false)
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('drivers').delete().eq('id', deleteTarget.id)
    if (!error) {
      setRows(prev => prev.filter(d => d.id !== deleteTarget.id))
      setSelected(prev => { const next = new Set(prev); next.delete(deleteTarget.id); return next })
      showToast('Driver deleted successfully')
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  const readOnly = drawerMode === 'view'
  const workingHours = computeWorkingHours(form.shiftStartTime, form.shiftEndTime)

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Drivers</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your drivers and their activity here.</p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
            <input
              type="text"
              placeholder="Search by name or phone"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-[38px] pr-3.5 py-2.5 w-72 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
            />
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-violet-700 transition-colors cursor-pointer">
            <Plus className="size-4" strokeWidth={2.5} />Add driver
          </button>
          <button className="p-2.5 border border-gray-300 rounded-lg bg-white text-gray-500 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 transition-colors cursor-pointer">
            <MoreHorizontal className="size-5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="h-[44px] px-6 text-left w-[40%]">
                <div className="flex items-center gap-3">
                  <IndeterminateCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
                  <button className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer transition-colors">
                    Name <ChevronDown className="size-3.5 shrink-0" strokeWidth={1.75} />
                  </button>
                </div>
              </th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">Driver ID</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">Phone</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">Status</th>
              <th className="h-[44px] w-[52px]" />
              <th className="h-[44px] w-[52px]" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={6}><EmptyState isFiltered={search.length > 0} onAdd={openAdd} /></td></tr>
            ) : pageRows.map((row, i) => (
              <tr key={row.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors">
                <td className="h-[72px] px-6 py-4">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)}
                      onClick={e => e.stopPropagation()}
                      className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer shrink-0" />
                    <Avatar initials={row.initials} index={(page - 1) * PAGE_SIZE + i} />
                    <span className="text-sm font-medium text-gray-900">{row.name}</span>
                  </div>
                </td>
                <td className="h-[72px] px-4 py-4 text-sm text-gray-500">{row.driverId}</td>
                <td className="h-[72px] px-4 py-4 text-sm text-gray-500">{row.phone ?? '—'}</td>
                <td className="h-[72px] px-4 py-4"><StatusBadge status={row.status} /></td>
                <td className="h-[72px] px-3 py-4">
                  <button type="button" onClick={() => setDeleteTarget(row)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer">
                    <Trash2 className="size-4" strokeWidth={1.75} />
                  </button>
                </td>
                <td className="h-[72px] px-3 py-4">
                  <RowMenu onView={() => openView(row)} onEdit={() => openEdit(row)} />
                </td>
              </tr>
            ))}
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
        title={drawerMode === 'add' ? 'Add Driver' : drawerMode === 'edit' ? 'Edit Driver' : 'View Driver'}
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
              <button type="button" onClick={handleSave} disabled={saving || !form.name.trim()}
                className="flex-1 h-10 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? 'Saving…' : drawerMode === 'add' ? 'Add Driver' : 'Save Changes'}
              </button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-4">

          {/* Driver ID — read-only for existing */}
          {activeDriver && (
            <Field label="Driver ID">
              <input type="text" readOnly value={activeDriver.driverId}
                className={clsx(inputCls, 'bg-gray-50 text-gray-500')} />
            </Field>
          )}

          <Field label="Name" required={!readOnly}>
            <input type="text" placeholder="John Doe" value={form.name}
              onChange={e => set('name', e.target.value)} disabled={readOnly} className={inputCls} />
          </Field>

          <Field label="Phone Number" required={!readOnly}>
            <input type="tel" placeholder="987654321" value={form.phone}
              onChange={e => set('phone', e.target.value)} disabled={readOnly} className={inputCls} />
          </Field>

          <Field label="Date of Birth">
            <input type="date" placeholder="DD/MM/YYYY" value={form.dateOfBirth}
              onChange={e => set('dateOfBirth', e.target.value)} disabled={readOnly} className={inputCls} />
          </Field>

          {/* Unique IDs */}
          <SectionCard title="Unique IDs">
            <Field label="PAN Number">
              <input type="text" placeholder="AXLPV7788X" value={form.panNumber}
                onChange={e => set('panNumber', e.target.value)} disabled={readOnly} className={inputCls} />
            </Field>
            <Field label="Aadhaar Number">
              <input type="text" placeholder="283363222012" value={form.aadhaarNumber}
                onChange={e => set('aadhaarNumber', e.target.value)} disabled={readOnly} className={inputCls} />
            </Field>
            <Field label="Driver License">
              <input type="text" placeholder="283363222012" value={form.driverLicense}
                onChange={e => set('driverLicense', e.target.value)} disabled={readOnly} className={inputCls} />
            </Field>
          </SectionCard>

          {/* Address */}
          <SectionCard title="Address">
            <Field label="Type" required={!readOnly}>
              <div className="relative">
                <select value={form.addressType} onChange={e => set('addressType', e.target.value)}
                  disabled={readOnly}
                  className={clsx(inputCls, 'appearance-none pr-9', readOnly ? 'cursor-default' : 'cursor-pointer')}>
                  {['Permanent Address', 'Current Address', 'Work Address'].map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
              </div>
            </Field>
            <Field label="Address">
              <textarea placeholder="Enter address..." value={form.address}
                onChange={e => set('address', e.target.value)} disabled={readOnly}
                rows={4} className={clsx(inputCls, 'resize-y')} />
            </Field>
          </SectionCard>

          <Field label="Salary per month">
            <input type="number" placeholder="10,000" value={form.salaryPerMonth}
              onChange={e => set('salaryPerMonth', e.target.value)} disabled={readOnly} className={inputCls} />
          </Field>

          <Field label="Daily Wages">
            <input type="number" placeholder="10,000" value={form.dailyWages}
              onChange={e => set('dailyWages', e.target.value)} disabled={readOnly} className={inputCls} />
          </Field>

          {/* Shift times */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Shift Start Time">
              <input type="time" value={form.shiftStartTime}
                onChange={e => set('shiftStartTime', e.target.value)} disabled={readOnly} className={inputCls} />
            </Field>
            <Field label="Shift End Time">
              <input type="time" value={form.shiftEndTime}
                onChange={e => set('shiftEndTime', e.target.value)} disabled={readOnly} className={inputCls} />
            </Field>
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            Total working hours: <span className="font-medium">{workingHours}</span>
          </p>

          <Field label="Off Day">
            <div className="relative">
              <select value={form.offDay} onChange={e => set('offDay', e.target.value)}
                disabled={readOnly}
                className={clsx(inputCls, 'appearance-none pr-9', readOnly ? 'cursor-default' : 'cursor-pointer')}>
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
            </div>
          </Field>

          <FileUpload
            label="Attach Files"
            storagePath="drivers"
            existingUrl={form.attachDocumentUrl || null}
            disabled={readOnly}
            onChange={url => set('attachDocumentUrl', url ?? '')}
          />

          <Field label="Notes">
            <textarea placeholder="Add a note...." value={form.notes}
              onChange={e => set('notes', e.target.value)} disabled={readOnly}
              rows={4} className={clsx(inputCls, 'resize-y')} />
          </Field>

        </div>
      </Drawer>

      <ConfirmDeleteModal
        open={deleteTarget !== null}
        title="Delete driver"
        description={deleteTarget ? `Are you sure you want to delete ${deleteTarget.name}? This action cannot be undone.` : ''}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </div>
  )
}
