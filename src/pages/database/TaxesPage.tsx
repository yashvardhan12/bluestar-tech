import { useState, useRef, useEffect } from 'react'
import { Search, Plus, Trash2, MoreHorizontal, ChevronDown, ChevronLeft, ChevronRight, Percent } from 'lucide-react'
import { clsx } from 'clsx'
import Drawer from '../../components/ui/Drawer'
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'

// ── types ─────────────────────────────────────────────────────────────────────

type TaxStatus = 'Active' | 'Inactive'
type DrawerMode = 'add' | 'view' | 'edit'

interface Tax {
  id: number
  taxName: string
  percentage: number
  status: TaxStatus
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

// ── status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TaxStatus }) {
  const active = status === 'Active'
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
      active
        ? 'bg-green-50 text-green-700 border-green-200'
        : 'bg-gray-50 text-gray-600 border-gray-200',
    )}>
      <span className={clsx('size-1.5 rounded-full shrink-0', active ? 'bg-green-500' : 'bg-gray-400')} />
      {status}
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

// ── form state ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  taxName: '',
  percentage: '',
  status: 'Active' as TaxStatus,
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
            <Percent className="size-6 text-white" strokeWidth={1.75} />
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-gray-900">No taxes found</p>
          <p className="mt-1 text-sm text-gray-500">
            {isFiltered
              ? 'No taxes match your search.'
              : <>There are no tax types yet. Start by clicking the <strong>Add tax type</strong> button above.</>}
          </p>
        </div>
        {isFiltered && (
          <button type="button" onClick={onAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors cursor-pointer">
            <Plus className="size-4" strokeWidth={2.5} />Add tax type
          </button>
        )}
      </div>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function TaxesPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<Tax[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('add')
  const [activeTax, setActiveTax] = useState<Tax | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Tax | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data } = await supabase
      .from('taxes')
      .select('id, tax_name, percentage, status, notes')
      .order('created_at', { ascending: false })
    if (data) {
      setRows(data.map((t: any) => ({
        id: t.id,
        taxName: t.tax_name,
        percentage: Number(t.percentage),
        status: t.status as TaxStatus,
        notes: t.notes,
      })))
    }
  }

  // ── filtering & pagination ────────────────────────────────────────────────

  const filtered = rows.filter(t => {
    const q = search.toLowerCase()
    return !q || t.taxName.toLowerCase().includes(q) || String(t.percentage).includes(q)
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

  function taxToForm(t: Tax): typeof EMPTY_FORM {
    return {
      taxName: t.taxName,
      percentage: String(t.percentage),
      status: t.status,
      notes: t.notes ?? '',
    }
  }

  function openAdd() {
    setForm(EMPTY_FORM); setActiveTax(null); setDrawerMode('add'); setDrawerOpen(true)
  }
  function openView(t: Tax) {
    setForm(taxToForm(t)); setActiveTax(t); setDrawerMode('view'); setDrawerOpen(true)
  }
  function openEdit(t: Tax) {
    setForm(taxToForm(t)); setActiveTax(t); setDrawerMode('edit'); setDrawerOpen(true)
  }

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // ── save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.taxName.trim() || !form.percentage) return
    setSaving(true)

    const payload = {
      tax_name: form.taxName.trim(),
      percentage: Number(form.percentage),
      status: form.status,
      notes: form.notes || null,
    }

    if (drawerMode === 'add') {
      const { error } = await supabase.from('taxes').insert(payload).select().single()
      if (!error) {
        await fetchData()
        showToast('Tax type added successfully')
      }
    } else if (drawerMode === 'edit' && activeTax) {
      const { error } = await supabase.from('taxes').update(payload).eq('id', activeTax.id)
      if (!error) {
        await fetchData()
        showToast('Tax type updated successfully')
      }
    }

    setSaving(false)
    setDrawerOpen(false)
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('taxes').delete().eq('id', deleteTarget.id)
    if (!error) {
      setSelected(prev => { const next = new Set(prev); next.delete(deleteTarget.id); return next })
      await fetchData()
      showToast('Tax type deleted successfully')
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  const readOnly = drawerMode === 'view'
  const canSave = form.taxName.trim() && form.percentage

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Taxes</h1>
          <p className="mt-1 text-sm text-gray-500">Create and manage your tax data here</p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
            <input
              type="text"
              placeholder="Search by tax name or percentage"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-[38px] pr-3.5 py-2.5 w-80 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
            />
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-violet-700 transition-colors cursor-pointer">
            <Plus className="size-4" strokeWidth={2.5} />Add tax type
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="h-[44px] px-6 text-left">
                <div className="flex items-center gap-3">
                  <IndeterminateCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
                  <button className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer transition-colors">
                    Tax Name <ChevronDown className="size-3.5 shrink-0" strokeWidth={1.75} />
                  </button>
                </div>
              </th>
              <th className="h-[44px] px-6 text-left text-xs font-medium text-gray-600 w-[200px]">Percentage</th>
              <th className="h-[44px] px-6 text-left text-xs font-medium text-gray-600 w-[160px]">Status</th>
              <th className="h-[44px] w-[68px]" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={4}><EmptyState isFiltered={search.length > 0} onAdd={openAdd} /></td></tr>
            ) : pageRows.map(row => (
              <tr key={row.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors">
                <td className="h-[72px] px-6 py-4">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)}
                      onClick={e => e.stopPropagation()}
                      className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer shrink-0" />
                    <span className="text-sm font-medium text-gray-900">{row.taxName}</span>
                  </div>
                </td>
                <td className="h-[72px] px-6 py-4 text-sm text-gray-500">{row.percentage.toFixed(2)}</td>
                <td className="h-[72px] px-6 py-4"><StatusBadge status={row.status} /></td>
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
        title={drawerMode === 'add' ? 'New Tax Type' : drawerMode === 'edit' ? 'Edit Tax Type' : 'Tax Type'}
        description={drawerMode === 'add' ? 'Add details of your tax' : undefined}
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
              <button type="button" onClick={handleSave} disabled={saving || !canSave}
                className="flex-1 h-10 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-4">

          <Field label="Tax Name" required={!readOnly}>
            <input type="text" placeholder="CGST" value={form.taxName}
              onChange={e => set('taxName', e.target.value)} disabled={readOnly} className={inputCls} />
          </Field>

          <Field label="Percentage %" required={!readOnly}>
            <input type="number" placeholder="0.00" min={0} max={100} step={0.01} value={form.percentage}
              onChange={e => set('percentage', e.target.value)} disabled={readOnly} className={inputCls} />
          </Field>

          {/* Status toggle — only shown in edit/view */}
          {drawerMode !== 'add' && (
            <Field label="Status">
              <div className="relative">
                <select value={form.status} onChange={e => set('status', e.target.value as TaxStatus)}
                  disabled={readOnly}
                  className={clsx(inputCls, 'appearance-none pr-9', readOnly ? 'cursor-default' : 'cursor-pointer')}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
              </div>
            </Field>
          )}

          <Field label="Notes">
            <textarea placeholder="Add notes...." value={form.notes}
              onChange={e => set('notes', e.target.value)} disabled={readOnly}
              rows={4} className={clsx(inputCls, 'resize-y')} />
          </Field>

        </div>
      </Drawer>

      <ConfirmDeleteModal
        open={deleteTarget !== null}
        title="Delete tax type"
        description={deleteTarget ? `Are you sure you want to delete "${deleteTarget.taxName}"? This action cannot be undone.` : ''}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </div>
  )
}
