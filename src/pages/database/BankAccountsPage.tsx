import { useState, useRef, useEffect } from 'react'
import { Search, Plus, Trash2, MoreHorizontal, ChevronDown, ChevronLeft, ChevronRight, Building2 } from 'lucide-react'
import { clsx } from 'clsx'
import Drawer from '../../components/ui/Drawer'
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'

// ── types ─────────────────────────────────────────────────────────────────────

type DrawerMode = 'add' | 'view' | 'edit'

interface BankAccount {
  id: number
  accountName: string
  accountNumber: string
  ifscCode: string
  bankName: string
  bankBranch: string
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

function Field({ label, required, children, error }: { label: string; required?: boolean; children: React.ReactNode; error?: string }) {
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

// ── form state ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  accountName: '',
  accountNumber: '',
  ifscCode: '',
  bankName: '',
  bankBranch: '',
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
            <Building2 className="size-6 text-white" strokeWidth={1.75} />
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-gray-900">No bank accounts found</p>
          <p className="mt-1 text-sm text-gray-500">
            {isFiltered
              ? 'No bank accounts match your search.'
              : <>There are no bank accounts yet. Start by clicking the <strong>Add bank account</strong> button above.</>}
          </p>
        </div>
        {isFiltered && (
          <button type="button" onClick={onAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors cursor-pointer">
            <Plus className="size-4" strokeWidth={2.5} />Add bank account
          </button>
        )}
      </div>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function BankAccountsPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<BankAccount[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('add')
  const [activeAccount, setActiveAccount] = useState<BankAccount | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data } = await supabase
      .from('bank_accounts')
      .select('id, account_name, account_number, ifsc_code, bank_name, bank_branch, notes')
      .order('created_at', { ascending: false })
    if (data) {
      setRows(data.map((b: any) => ({
        id: b.id,
        accountName: b.account_name,
        accountNumber: b.account_number,
        ifscCode: b.ifsc_code,
        bankName: b.bank_name,
        bankBranch: b.bank_branch,
        notes: b.notes,
      })))
    }
  }

  // ── filtering & pagination ────────────────────────────────────────────────

  const filtered = rows.filter(b => {
    const q = search.toLowerCase()
    return !q || b.accountName.toLowerCase().includes(q) || b.bankName.toLowerCase().includes(q) || b.accountNumber.toLowerCase().includes(q)
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

  function accountToForm(b: BankAccount): typeof EMPTY_FORM {
    return {
      accountName: b.accountName,
      accountNumber: b.accountNumber,
      ifscCode: b.ifscCode,
      bankName: b.bankName,
      bankBranch: b.bankBranch,
      notes: b.notes ?? '',
    }
  }

  function openAdd() {
    setForm(EMPTY_FORM); setActiveAccount(null); setDrawerMode('add'); setErrors({}); setDrawerOpen(true)
  }
  function openView(b: BankAccount) {
    setForm(accountToForm(b)); setActiveAccount(b); setDrawerMode('view'); setErrors({}); setDrawerOpen(true)
  }
  function openEdit(b: BankAccount) {
    setForm(accountToForm(b)); setActiveAccount(b); setDrawerMode('edit'); setErrors({}); setDrawerOpen(true)
  }

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: '' }))
  }

  // ── save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    const newErrors: Record<string, string> = {}
    if (!form.accountName.trim()) newErrors.accountName = 'Account name is required'
    if (!form.accountNumber.trim()) newErrors.accountNumber = 'Account number is required'
    if (!form.ifscCode.trim()) newErrors.ifscCode = 'IFSC code is required'
    if (!form.bankName.trim()) newErrors.bankName = 'Bank name is required'
    if (!form.bankBranch.trim()) newErrors.bankBranch = 'Bank branch is required'
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }
    setSaving(true)

    const payload = {
      account_name: form.accountName.trim(),
      account_number: form.accountNumber.trim(),
      ifsc_code: form.ifscCode.trim(),
      bank_name: form.bankName.trim(),
      bank_branch: form.bankBranch.trim(),
      notes: form.notes || null,
    }

    if (drawerMode === 'add') {
      const { error } = await supabase.from('bank_accounts').insert(payload).select().single()
      if (!error) {
        await fetchData()
        showToast('Bank account added successfully')
      }
    } else if (drawerMode === 'edit' && activeAccount) {
      const { error } = await supabase.from('bank_accounts').update(payload).eq('id', activeAccount.id)
      if (!error) {
        await fetchData()
        showToast('Bank account updated successfully')
      }
    }

    setSaving(false)
    setDrawerOpen(false)
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('bank_accounts').delete().eq('id', deleteTarget.id)
    if (!error) {
      setSelected(prev => { const next = new Set(prev); next.delete(deleteTarget.id); return next })
      await fetchData()
      showToast('Bank account deleted successfully')
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  async function handleBulkDelete() {
    setBulkDeleting(true)
    const ids = Array.from(selected)
    const { error } = await supabase.from('bank_accounts').delete().in('id', ids)
    if (!error) {
      setSelected(new Set())
      await fetchData()
      showToast(`${ids.length} bank account${ids.length > 1 ? 's' : ''} deleted`)
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
          <h1 className="text-2xl font-semibold text-gray-900">Bank Accounts</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your bank accounts here.</p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
            <input
              type="text"
              placeholder="Search by name or bank"
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
              <Plus className="size-4" strokeWidth={2.5} />Add bank account
            </button>
          )}
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
              <th className="h-[44px] px-6 text-left w-[28%]">
                <div className="flex items-center gap-3">
                  <IndeterminateCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
                  <button className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer transition-colors">
                    Account Name <ChevronDown className="size-3.5 shrink-0" strokeWidth={1.75} />
                  </button>
                </div>
              </th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">Account Number</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">Bank Name</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">Branch</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">IFSC Code</th>
              <th className="h-[44px] w-[68px]" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={6}><EmptyState isFiltered={search.length > 0} onAdd={openAdd} /></td></tr>
            ) : pageRows.map(row => (
              <tr key={row.id} onClick={() => openView(row)} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer">
                <td className="h-[72px] px-6 py-4">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)}
                      onClick={e => e.stopPropagation()}
                      className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer shrink-0" />
                    <div className="size-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                      <Building2 className="size-4 text-violet-600" strokeWidth={1.75} />
                    </div>
                    <span className="text-sm font-medium text-gray-900">{row.accountName}</span>
                  </div>
                </td>
                <td className="h-[72px] px-4 py-4 text-sm text-gray-500">{row.accountNumber}</td>
                <td className="h-[72px] px-4 py-4 text-sm text-gray-500">{row.bankName}</td>
                <td className="h-[72px] px-4 py-4 text-sm text-gray-500">{row.bankBranch}</td>
                <td className="h-[72px] px-4 py-4 text-sm text-gray-500">{row.ifscCode}</td>
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
        {totalPages > 1 && (
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
        )}
      </div>

      {/* Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'add' ? 'New Bank Account' : drawerMode === 'edit' ? 'Edit Bank Account' : 'Bank Account'}
        description={drawerMode === 'add' ? 'Add details of your bank account' : undefined}
        footer={
          readOnly ? (
            <div className="flex justify-end">
              <button type="button" onClick={() => setDrawerMode('edit')}
                className="px-3.5 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
                Edit
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={drawerMode === 'edit' ? () => { setDrawerMode('view'); setErrors({}) } : () => setDrawerOpen(false)}
                className="px-3.5 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="px-3.5 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )
        }
      >
        <div className="flex flex-col gap-4">

          <Field label="Account Name" required={!readOnly} error={errors.accountName}>
            <input type="text" placeholder="BLUDRIVER01" value={form.accountName}
              onChange={e => set('accountName', e.target.value)} disabled={readOnly}
              className={clsx(inputCls, errors.accountName && 'border-red-300 focus:border-red-400 focus:ring-red-100')} />
          </Field>

          <Field label="Account Number" required={!readOnly} error={errors.accountNumber}>
            <input type="text" placeholder="John Doe" value={form.accountNumber}
              onChange={e => set('accountNumber', e.target.value)} disabled={readOnly}
              className={clsx(inputCls, errors.accountNumber && 'border-red-300 focus:border-red-400 focus:ring-red-100')} />
          </Field>

          <Field label="IFSC Code" required={!readOnly} error={errors.ifscCode}>
            <input type="text" placeholder="987654321" value={form.ifscCode}
              onChange={e => set('ifscCode', e.target.value)} disabled={readOnly}
              className={clsx(inputCls, errors.ifscCode && 'border-red-300 focus:border-red-400 focus:ring-red-100')} />
          </Field>

          <Field label="Bank Name" required={!readOnly} error={errors.bankName}>
            <input type="text" placeholder="State Bank of India" value={form.bankName}
              onChange={e => set('bankName', e.target.value)} disabled={readOnly}
              className={clsx(inputCls, errors.bankName && 'border-red-300 focus:border-red-400 focus:ring-red-100')} />
          </Field>

          <Field label="Bank Branch" required={!readOnly} error={errors.bankBranch}>
            <input type="text" placeholder="Main Branch" value={form.bankBranch}
              onChange={e => set('bankBranch', e.target.value)} disabled={readOnly}
              className={clsx(inputCls, errors.bankBranch && 'border-red-300 focus:border-red-400 focus:ring-red-100')} />
          </Field>

          <Field label="Notes">
            <textarea placeholder="Add a note...." value={form.notes}
              onChange={e => set('notes', e.target.value)} disabled={readOnly}
              rows={4} className={clsx(inputCls, 'resize-y')} />
          </Field>

        </div>
      </Drawer>

      <ConfirmDeleteModal
        open={deleteTarget !== null}
        title="Delete bank account"
        description={deleteTarget ? `Are you sure you want to delete "${deleteTarget.accountName}"? This action cannot be undone.` : ''}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        deleting={deleting}
      />
      <ConfirmDeleteModal
        open={bulkDeleteOpen}
        title={`Delete ${selected.size} bank account${selected.size > 1 ? 's' : ''}`}
        description={`Are you sure you want to delete ${selected.size} selected bank account${selected.size > 1 ? 's' : ''}? This action cannot be undone.`}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        deleting={bulkDeleting}
      />
    </div>
  )
}
