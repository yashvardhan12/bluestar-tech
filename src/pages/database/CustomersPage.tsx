import { useState, useRef, useEffect } from 'react'
import { Search, Plus, Trash2, MoreHorizontal, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import Drawer from '../../components/ui/Drawer'
import FileUpload from '../../components/ui/FileUpload'
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'

// ── types ─────────────────────────────────────────────────────────────────────

type DrawerMode = 'add' | 'view' | 'edit'

interface Customer {
  id: number
  customerCode: string
  name: string
  address: string | null
  pincode: string | null
  state: string | null
  phone: string | null
  email: string | null
  taxType: string | null
  gstinNumber: string | null
  billingName: string | null
  billingAddress: string | null
  taxes: string | null
  defaultDiscount: string | null
  attachDocumentUrl: string | null
  notes: string | null
  autoCreateInvoice: boolean
}

const PAGE_SIZE = 8

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry',
]

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
        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer">
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
  address: '',
  pincode: '',
  state: '',
  phone: '',
  email: '',
  taxType: 'Business',
  gstinNumber: '',
  billingName: '',
  billingAddress: '',
  taxes: '',
  defaultDiscount: '',
  attachDocumentUrl: '',
  notes: '',
  autoCreateInvoice: false,
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-gray-900">No customers found</p>
          <p className="mt-1 text-sm text-gray-500">
            {isFiltered ? 'No customers match your search.' : <>There are no customers yet. Start by clicking the <strong>Add customer</strong> button above.</>}
          </p>
        </div>
        {isFiltered && (
          <button type="button" onClick={onAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors cursor-pointer">
            <Plus className="size-4" strokeWidth={2.5} />Add customer
          </button>
        )}
      </div>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('add')
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) {
      setRows(data.map((c: any) => ({
        id: c.id,
        customerCode: c.customer_code,
        name: c.name,
        address: c.address,
        pincode: c.pincode,
        state: c.state,
        phone: c.phone,
        email: c.email,
        taxType: c.tax_type,
        gstinNumber: c.gstin_number,
        billingName: c.billing_name,
        billingAddress: c.billing_address,
        taxes: c.taxes,
        defaultDiscount: c.default_discount != null ? String(c.default_discount) : null,
        attachDocumentUrl: c.attach_document_url,
        notes: c.notes,
        autoCreateInvoice: c.auto_create_invoice,
      })))
    }
  }

  // ── filtering & pagination ────────────────────────────────────────────────

  const filtered = rows.filter(c => {
    const q = search.toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q) || c.customerCode.toLowerCase().includes(q)
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

  function customerToForm(c: Customer): typeof EMPTY_FORM {
    return {
      name: c.name,
      address: c.address ?? '',
      pincode: c.pincode ?? '',
      state: c.state ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      taxType: c.taxType ?? 'Business',
      gstinNumber: c.gstinNumber ?? '',
      billingName: c.billingName ?? '',
      billingAddress: c.billingAddress ?? '',
      taxes: c.taxes ?? '',
      defaultDiscount: c.defaultDiscount ?? '',
      attachDocumentUrl: c.attachDocumentUrl ?? '',
      notes: c.notes ?? '',
      autoCreateInvoice: c.autoCreateInvoice,
    }
  }

  function openAdd() {
    setForm(EMPTY_FORM); setActiveCustomer(null); setDrawerMode('add'); setDrawerOpen(true)
  }
  function openView(c: Customer) {
    setForm(customerToForm(c)); setActiveCustomer(c); setDrawerMode('view'); setDrawerOpen(true)
  }
  function openEdit(c: Customer) {
    setForm(customerToForm(c)); setActiveCustomer(c); setDrawerMode('edit'); setDrawerOpen(true)
  }

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // ── save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)

    const payload = {
      name: form.name.trim(),
      address: form.address || null,
      pincode: form.pincode || null,
      state: form.state || null,
      phone: form.phone || null,
      email: form.email || null,
      tax_type: form.taxType || null,
      gstin_number: form.gstinNumber || null,
      billing_name: form.billingName || null,
      billing_address: form.billingAddress || null,
      taxes: form.taxes || null,
      default_discount: form.defaultDiscount ? Number(form.defaultDiscount) : null,
      attach_document_url: form.attachDocumentUrl || null,
      notes: form.notes || null,
      auto_create_invoice: form.autoCreateInvoice,
    }

    if (drawerMode === 'add') {
      const { data: last } = await supabase
        .from('customers')
        .select('customer_code')
        .order('created_at', { ascending: false })
        .limit(1)
      const lastNum = last?.[0]?.customer_code ? parseInt(last[0].customer_code.replace(/\D/g, '')) : 0
      const nextCode = `BLUCUST${String(lastNum + 1).padStart(2, '0')}`

      const { error } = await supabase
        .from('customers')
        .insert({ ...payload, customer_code: nextCode })
        .select()
        .single()

      if (!error) {
        await fetchData()
        showToast('Customer added successfully')
      }
    } else if (drawerMode === 'edit' && activeCustomer) {
      const { error } = await supabase.from('customers').update(payload).eq('id', activeCustomer.id)
      if (!error) {
        await fetchData()
        showToast('Customer updated successfully')
      }
    }

    setSaving(false)
    setDrawerOpen(false)
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('customers').delete().eq('id', deleteTarget.id)
    if (!error) {
      setSelected(prev => { const next = new Set(prev); next.delete(deleteTarget.id); return next })
      await fetchData()
      showToast('Customer deleted successfully')
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  const readOnly = drawerMode === 'view'

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Customers</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your customers and their details here.</p>
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
            <Plus className="size-4" strokeWidth={2.5} />Add customer
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
              <th className="h-[44px] px-6 text-left w-[35%]">
                <div className="flex items-center gap-3">
                  <IndeterminateCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
                  <button className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer transition-colors">
                    Name <ChevronDown className="size-3.5 shrink-0" strokeWidth={1.75} />
                  </button>
                </div>
              </th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">Customer Code</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">Phone</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">State</th>
              <th className="h-[44px] w-[68px]" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={5}><EmptyState isFiltered={search.length > 0} onAdd={openAdd} /></td></tr>
            ) : pageRows.map((row, i) => (
              <tr key={row.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors">
                <td className="h-[72px] px-6 py-4">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)}
                      onClick={e => e.stopPropagation()}
                      className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer shrink-0" />
                    <Avatar initials={getInitials(row.name)} index={(page - 1) * PAGE_SIZE + i} />
                    <span className="text-sm font-medium text-gray-900">{row.name}</span>
                  </div>
                </td>
                <td className="h-[72px] px-4 py-4 text-sm text-gray-500">{row.customerCode}</td>
                <td className="h-[72px] px-4 py-4 text-sm text-gray-500">{row.phone ?? '—'}</td>
                <td className="h-[72px] px-4 py-4 text-sm text-gray-500">{row.state ?? '—'}</td>
                <td className="h-[72px] p-4" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={e => { e.stopPropagation(); setDeleteTarget(row) }}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 transition-colors cursor-pointer">
                      <Trash2 className="size-5" strokeWidth={1.75} />
                    </button>
                    <RowMenu onView={() => openView(row)} onEdit={() => openEdit(row)} />
                  </div>
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
        title={drawerMode === 'add' ? 'Add Customer' : drawerMode === 'edit' ? 'Edit Customer' : 'View Customer'}
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
                {saving ? 'Saving…' : drawerMode === 'add' ? 'Add Customer' : 'Save Changes'}
              </button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-4">

          {/* Customer Code — read-only */}
          {activeCustomer && (
            <Field label="Customer Code">
              <input type="text" readOnly value={activeCustomer.customerCode}
                className={clsx(inputCls, 'bg-gray-50 text-gray-500')} />
            </Field>
          )}

          <Field label="Name" required={!readOnly}>
            <input type="text" placeholder="John Doe" value={form.name}
              onChange={e => set('name', e.target.value)} disabled={readOnly} className={inputCls} />
          </Field>

          <Field label="Address" required={!readOnly}>
            <textarea placeholder="Enter address..." value={form.address}
              onChange={e => set('address', e.target.value)} disabled={readOnly}
              rows={4} className={clsx(inputCls, 'resize-y')} />
          </Field>

          <Field label="Pincode">
            <input type="text" placeholder="100001" value={form.pincode}
              onChange={e => set('pincode', e.target.value)} disabled={readOnly} className={inputCls} />
          </Field>

          <Field label="State">
            <div className="relative">
              <select value={form.state} onChange={e => set('state', e.target.value)}
                disabled={readOnly}
                className={clsx(inputCls, 'appearance-none pr-9', readOnly ? 'cursor-default' : 'cursor-pointer')}>
                <option value="">Select state</option>
                {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
            </div>
          </Field>

          <Field label="Phone Number" required={!readOnly}>
            <input type="tel" placeholder="987654321" value={form.phone}
              onChange={e => set('phone', e.target.value)} disabled={readOnly} className={inputCls} />
          </Field>

          <Field label="Email Address">
            <input type="email" placeholder="olivia@untitledui.com" value={form.email}
              onChange={e => set('email', e.target.value)} disabled={readOnly} className={inputCls} />
          </Field>

          {/* Customer Tax Details */}
          <SectionCard title="Customer Tax Details">
            <Field label="Type">
              <div className="relative">
                <select value={form.taxType} onChange={e => set('taxType', e.target.value)}
                  disabled={readOnly}
                  className={clsx(inputCls, 'appearance-none pr-9', readOnly ? 'cursor-default' : 'cursor-pointer')}>
                  {['Business', 'Individual'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
              </div>
            </Field>
            <Field label="GSTIN Number">
              <input type="text" placeholder="AXLPV7788X" value={form.gstinNumber}
                onChange={e => set('gstinNumber', e.target.value)} disabled={readOnly} className={inputCls} />
            </Field>
            <Field label="Billing Name">
              <input type="text" placeholder="Business Name" value={form.billingName}
                onChange={e => set('billingName', e.target.value)} disabled={readOnly} className={inputCls} />
            </Field>
            <Field label="Billing Address">
              <textarea placeholder="Enter address..." value={form.billingAddress}
                onChange={e => set('billingAddress', e.target.value)} disabled={readOnly}
                rows={4} className={clsx(inputCls, 'resize-y')} />
            </Field>
            <Field label="Taxes">
              <input type="text" placeholder="Select tax" value={form.taxes}
                onChange={e => set('taxes', e.target.value)} disabled={readOnly} className={inputCls} />
            </Field>
          </SectionCard>

          <Field label="Default discount %">
            <input type="number" placeholder="0" min={0} max={100} value={form.defaultDiscount}
              onChange={e => set('defaultDiscount', e.target.value)} disabled={readOnly} className={inputCls} />
          </Field>

          <FileUpload
            label="Attach Files"
            storagePath="customers"
            existingUrl={form.attachDocumentUrl || null}
            disabled={readOnly}
            onChange={url => set('attachDocumentUrl', url ?? '')}
          />

          <Field label="Notes">
            <textarea placeholder="Add a note...." value={form.notes}
              onChange={e => set('notes', e.target.value)} disabled={readOnly}
              rows={4} className={clsx(inputCls, 'resize-y')} />
          </Field>

          {/* Auto create invoice checkbox */}
          <label className={clsx('flex items-start gap-3', readOnly ? 'cursor-default' : 'cursor-pointer')}>
            <div className="flex items-center justify-center pt-0.5 shrink-0">
              <input
                type="checkbox"
                checked={form.autoCreateInvoice}
                onChange={e => set('autoCreateInvoice', e.target.checked)}
                disabled={readOnly}
                className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer"
              />
            </div>
            <span className="text-sm font-medium text-gray-700">Auto create invoice when duty is completed</span>
          </label>

        </div>
      </Drawer>

      <ConfirmDeleteModal
        open={deleteTarget !== null}
        title="Delete customer"
        description={deleteTarget ? `Are you sure you want to delete ${deleteTarget.name}? This action cannot be undone.` : ''}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </div>
  )
}
