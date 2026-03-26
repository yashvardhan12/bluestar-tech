import { useState, useRef, useEffect } from 'react'
import { Search, Plus, Trash2, MoreHorizontal, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import Drawer from '../../components/ui/Drawer'
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'

// ── types ─────────────────────────────────────────────────────────────────────

type PaymentMode = 'Cash' | 'Card' | 'UPI' | 'Cheque' | 'Bank Transfer'
type DrawerMode = 'add' | 'view' | 'edit'

interface Expense {
  id: number
  vehicleName: string
  vehicleNumber: string
  expenseNumber: string
  date: string
  paymentMode: PaymentMode
  amount: number
  description: string | null
}

const PAGE_SIZE = 8

const PAYMENT_MODES: PaymentMode[] = ['Cash', 'Card', 'UPI', 'Cheque', 'Bank Transfer']

// ── helpers ───────────────────────────────────────────────────────────────────

function getPaginationPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, '...', total - 2, total - 1, total]
  if (current >= total - 2) return [1, 2, 3, '...', total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}

function formatINR(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN')
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`
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

function Field({ label, required, children, error }: {
  label: string; required?: boolean; children: React.ReactNode; error?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-0.5 text-sm font-medium text-gray-700">
        {label}{required && <span className="text-violet-600">*</span>}
      </label>
      {children}
      {error && <p className="mt-0.5 text-xs text-red-600">{error}</p>}
    </div>
  )
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
            </svg>
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-gray-900">No expenses found</p>
          <p className="mt-1 text-sm text-gray-500">
            {isFiltered
              ? 'No expenses match your search.'
              : <>There are no expenses yet. Start by clicking the <strong>Add expense</strong> button above.</>}
          </p>
        </div>
        {isFiltered && (
          <button type="button" onClick={onAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors cursor-pointer">
            <Plus className="size-4" strokeWidth={2.5} />Add expense
          </button>
        )}
      </div>
    </div>
  )
}

// ── form state ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  vehicleName: '',
  vehicleNumber: '',
  date: '',
  paymentMode: 'Cash' as PaymentMode,
  amount: '',
  description: '',
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function GeneralExpensesPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<Expense[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('add')
  const [activeExpense, setActiveExpense] = useState<Expense | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data } = await supabase
      .from('vehicle_expenses')
      .select('id, vehicle_name, vehicle_number, expense_number, date, payment_mode, amount, description')
      .order('created_at', { ascending: false })
    if (data) {
      setRows(data.map((d: any) => ({
        id: d.id,
        vehicleName: d.vehicle_name,
        vehicleNumber: d.vehicle_number,
        expenseNumber: d.expense_number,
        date: d.date,
        paymentMode: d.payment_mode as PaymentMode,
        amount: Number(d.amount),
        description: d.description,
      })))
    }
  }

  // ── filtering & pagination ────────────────────────────────────────────────

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    return !q ||
      r.vehicleName.toLowerCase().includes(q) ||
      r.vehicleNumber.toLowerCase().includes(q)
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
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ── drawer helpers ────────────────────────────────────────────────────────

  function expenseToForm(e: Expense): typeof EMPTY_FORM {
    return {
      vehicleName: e.vehicleName,
      vehicleNumber: e.vehicleNumber,
      date: e.date,
      paymentMode: e.paymentMode,
      amount: String(e.amount),
      description: e.description ?? '',
    }
  }

  function openAdd() {
    setForm(EMPTY_FORM); setActiveExpense(null); setDrawerMode('add'); setErrors({}); setDrawerOpen(true)
  }
  function openView(e: Expense) {
    setForm(expenseToForm(e)); setActiveExpense(e); setDrawerMode('view'); setErrors({}); setDrawerOpen(true)
  }
  function openEdit(e: Expense) {
    setForm(expenseToForm(e)); setActiveExpense(e); setDrawerMode('edit'); setErrors({}); setDrawerOpen(true)
  }

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: '' }))
  }

  // ── save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    const newErrors: Record<string, string> = {}
    if (!form.vehicleName.trim()) newErrors.vehicleName = 'Vehicle name is required'
    if (!form.vehicleNumber.trim()) newErrors.vehicleNumber = 'Vehicle number is required'
    if (!form.date) newErrors.date = 'Date is required'
    if (!form.amount || isNaN(Number(form.amount))) newErrors.amount = 'Valid amount is required'
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }
    setSaving(true)

    const payload = {
      vehicle_name: form.vehicleName.trim(),
      vehicle_number: form.vehicleNumber.trim().toUpperCase(),
      date: form.date,
      payment_mode: form.paymentMode,
      amount: Number(form.amount),
      description: form.description || null,
    }

    if (drawerMode === 'add') {
      const { data: last } = await supabase
        .from('vehicle_expenses')
        .select('expense_number')
        .order('created_at', { ascending: false })
        .limit(1)
      const lastNum = last?.[0]?.expense_number
        ? parseInt(last[0].expense_number.replace(/\D/g, '').slice(-2) || '0')
        : 0
      const prefix = payload.vehicle_number.replace(/\s/g, '')
      const expenseNumber = `${prefix} - ${lastNum + 1}`

      const { error } = await supabase
        .from('vehicle_expenses')
        .insert({ ...payload, expense_number: expenseNumber })
      if (!error) { await fetchData(); showToast('Expense added successfully') }
    } else if (drawerMode === 'edit' && activeExpense) {
      const { error } = await supabase
        .from('vehicle_expenses')
        .update(payload)
        .eq('id', activeExpense.id)
      if (!error) { await fetchData(); showToast('Expense updated successfully') }
    }

    setSaving(false)
    setDrawerOpen(false)
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('vehicle_expenses').delete().eq('id', deleteTarget.id)
    if (!error) {
      setSelected(prev => { const next = new Set(prev); next.delete(deleteTarget.id); return next })
      await fetchData()
      showToast('Expense deleted successfully')
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  async function handleBulkDelete() {
    setBulkDeleting(true)
    const ids = Array.from(selected)
    const { error } = await supabase.from('vehicle_expenses').delete().in('id', ids)
    if (!error) {
      setSelected(new Set())
      await fetchData()
      showToast(`${ids.length} expense${ids.length > 1 ? 's' : ''} deleted`)
    }
    setBulkDeleting(false)
    setBulkDeleteOpen(false)
  }

  const readOnly = drawerMode === 'view'

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Expenses</h1>
          <p className="mt-1 text-sm text-gray-500">Create and manage your vehicle expenses here</p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
            <input
              type="text"
              placeholder="Search by car"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-[38px] pr-3.5 py-2.5 w-72 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
            />
          </div>
          {selected.size > 0 ? (
            <button onClick={() => setBulkDeleteOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-red-700 transition-colors cursor-pointer">
              <Trash2 className="size-4" strokeWidth={2.5} />Delete {selected.size} selected
            </button>
          ) : (
            <button onClick={openAdd}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-violet-700 transition-colors cursor-pointer">
              <Plus className="size-4" strokeWidth={2.5} />Add expense
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="h-[44px] px-6 text-left w-[22%]">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleAll}
                    className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer"
                  />
                  <button className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer transition-colors">
                    Vehicle Name and Number <ChevronDown className="size-3.5 shrink-0" strokeWidth={1.75} />
                  </button>
                </div>
              </th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">Expense Number</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">Date</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">Payment Mode</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">Amount</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">Description</th>
              <th className="h-[44px] w-[52px]" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={7}><EmptyState isFiltered={search.length > 0} onAdd={openAdd} /></td></tr>
            ) : pageRows.map(row => (
              <tr key={row.id} onClick={() => openView(row)}
                className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer">
                <td className="h-[72px] px-6 py-4">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)}
                      onClick={e => e.stopPropagation()}
                      className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{row.vehicleName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{row.vehicleNumber}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-gray-700">{row.expenseNumber}</td>
                <td className="px-4 py-4 text-sm text-gray-700">{formatDate(row.date)}</td>
                <td className="px-4 py-4 text-sm text-gray-700">{row.paymentMode}</td>
                <td className="px-4 py-4 text-sm text-gray-700">{formatINR(row.amount)}</td>
                <td className="px-4 py-4 text-sm text-gray-500 max-w-[200px] truncate">{row.description ?? '—'}</td>
                <td className="px-2 py-4 text-right" onClick={e => e.stopPropagation()}>
                  <RowMenu onView={() => openView(row)} onEdit={() => openEdit(row)} />
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
            className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]"
          >
            ← Previous
          </button>
          <div className="flex items-center gap-0.5">
            {getPaginationPages(page, totalPages).map((p, i) =>
              p === '...'
                ? <span key={`e${i}`} className="size-10 flex items-center justify-center text-sm text-gray-500">…</span>
                : <button key={p} onClick={() => setPage(p as number)}
                    className={clsx('size-10 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                      page === p ? 'bg-gray-100 text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-50')}>
                    {p}
                  </button>
            )}
          </div>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]"
          >
            Next →
          </button>
        </div>
      )}

      {/* Add / Edit Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={readOnly ? 'View expense' : drawerMode === 'add' ? 'Add expense' : 'Edit expense'}
        footer={
          readOnly ? (
            <div className="flex justify-end">
              <button onClick={() => { setDrawerMode('edit'); setErrors({}) }}
                className="px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors cursor-pointer">
                Edit
              </button>
            </div>
          ) : (
            <div className="flex justify-end gap-3">
              <button
                onClick={() => drawerMode === 'edit' ? (setDrawerMode('view'), setErrors({})) : setDrawerOpen(false)}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-60 transition-colors cursor-pointer">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )
        }
      >
        <div className="flex flex-col gap-5 p-6">
          <Field label="Vehicle Name" required error={errors.vehicleName}>
            <input className={clsx(inputCls, errors.vehicleName && 'border-red-400 focus:border-red-400 focus:ring-red-100')}
              value={form.vehicleName} onChange={e => set('vehicleName', e.target.value)}
              placeholder="e.g. Jeep Compass" disabled={readOnly} />
          </Field>

          <Field label="Vehicle Number" required error={errors.vehicleNumber}>
            <input className={clsx(inputCls, errors.vehicleNumber && 'border-red-400 focus:border-red-400 focus:ring-red-100')}
              value={form.vehicleNumber} onChange={e => set('vehicleNumber', e.target.value.toUpperCase())}
              placeholder="e.g. RJ90AB8264" disabled={readOnly} />
          </Field>

          <Field label="Date" required error={errors.date}>
            <input type="date"
              className={clsx(inputCls, errors.date && 'border-red-400 focus:border-red-400 focus:ring-red-100')}
              value={form.date} onChange={e => set('date', e.target.value)}
              disabled={readOnly} />
          </Field>

          <Field label="Payment Mode" required>
            <select className={inputCls} value={form.paymentMode}
              onChange={e => set('paymentMode', e.target.value as PaymentMode)} disabled={readOnly}>
              {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>

          <Field label="Amount (₹)" required error={errors.amount}>
            <input type="number" min="0"
              className={clsx(inputCls, errors.amount && 'border-red-400 focus:border-red-400 focus:ring-red-100')}
              value={form.amount} onChange={e => set('amount', e.target.value)}
              placeholder="e.g. 10000" disabled={readOnly} />
          </Field>

          <Field label="Description">
            <textarea rows={3} className={clsx(inputCls, 'resize-none')}
              value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Battery, Suspension, Air Conditioning…" disabled={readOnly} />
          </Field>
        </div>
      </Drawer>

      {/* Single delete confirm */}
      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Delete expense"
        description={deleteTarget ? `Delete the expense for ${deleteTarget.vehicleName} (${deleteTarget.expenseNumber})? This cannot be undone.` : ''}
        deleting={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Bulk delete confirm */}
      <ConfirmDeleteModal
        open={bulkDeleteOpen}
        title={`Delete ${selected.size} expense${selected.size > 1 ? 's' : ''}`}
        description={`This will permanently delete ${selected.size} selected expense${selected.size > 1 ? 's' : ''}. This cannot be undone.`}
        deleting={bulkDeleting}
        onConfirm={handleBulkDelete}
        onClose={() => setBulkDeleteOpen(false)}
      />
    </div>
  )
}
