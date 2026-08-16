import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, Trash2, MoreHorizontal, ChevronDown, ChevronLeft, ChevronRight,
  AlertCircle, FileText,
} from 'lucide-react'
import { clsx } from 'clsx'
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal'
import StatusBadge, { type InvoiceStatus } from '../../components/ui/StatusBadge'
import DateRangePicker, { type DateRange } from '../../components/ui/DateRangePicker'
import { supabase } from '../../lib/supabase'
import { useMenuFlip } from '../../lib/useMenuFlip'
import { useToast } from '../../components/ui/Toast'
import { useActiveCompany } from '../../lib/useActiveCompany'
import { useAuth } from '../../lib/auth'
import { formatINR } from '../../lib/money'

// ── types ─────────────────────────────────────────────────────────────────────

interface Invoice {
  id: number
  invoiceNumber: string
  invoiceDate: string          // ISO
  customerName: string
  status: InvoiceStatus
  total: number
  amountPaid: number
  outstanding: number
  bookingRefs: string[]
}

interface FetchError {
  message: string
  code: string
  at: string
}

const PAGE_SIZE = 8
const COLUMN_COUNT = 9

// ── helpers ───────────────────────────────────────────────────────────────────

function getPaginationPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, '...', total - 2, total - 1, total]
  if (current >= total - 2) return [1, 2, 3, '...', total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}

/** ISO `2024-10-28` → `28/10/2024`, matching the rest of the invoice UI. */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function IndeterminateCheckbox({ checked, indeterminate, onChange }: {
  checked: boolean; indeterminate: boolean; onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return (
    <input ref={ref} type="checkbox" checked={checked} onChange={onChange}
      aria-label="Select all invoices on this page"
      className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer" />
  )
}

// ── row menu ──────────────────────────────────────────────────────────────────

interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

/**
 * Actions depend on status — a Paid invoice must not be editable or deletable,
 * and a Cancelled one must not be cancellable twice. Same shape as
 * getBookingActions in AllBookingsPage.
 */
function getInvoiceActions(invoice: Invoice, h: {
  onView: () => void
  onEdit: () => void
  onCancel: () => void
  onDelete: () => void
}): MenuItem[] {
  switch (invoice.status) {
    case 'Generated':
      return [
        { label: 'View', onClick: h.onView },
        { label: 'Edit', onClick: h.onEdit },
        { label: 'Cancel invoice', onClick: h.onCancel, danger: true },
        { label: 'Delete', onClick: h.onDelete, danger: true },
      ]
    case 'Paid':
      return [{ label: 'View', onClick: h.onView }]
    case 'Cancelled':
      return [
        { label: 'View', onClick: h.onView },
        { label: 'Delete', onClick: h.onDelete, danger: true },
      ]
  }
}

function RowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.right - 176 })
    setOpen(v => !v)
  }

  useMenuFlip(open, btnRef, menuRef, top => setPos(p => ({ ...p, top })))

  return (
    <>
      <button ref={btnRef} type="button" onClick={handleOpen} aria-label="Invoice actions"
        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer">
        <MoreHorizontal className="size-5" strokeWidth={1.75} />
      </button>
      {open && createPortal(
        <div ref={menuRef} style={{ top: pos.top, left: pos.left }}
          className="fixed z-[9999] w-44 bg-white rounded-lg border border-gray-200 shadow-[0px_8px_16px_-4px_rgba(16,24,40,0.08)] py-1">
          {items.map(item => (
            <button key={item.label} type="button"
              onClick={() => { item.onClick(); setOpen(false) }}
              className={clsx(
                'w-full px-4 py-2 text-sm text-left hover:bg-gray-50 cursor-pointer',
                item.danger ? 'text-red-600' : 'text-gray-700',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

// ── table states ──────────────────────────────────────────────────────────────

/**
 * Skeleton rows in the table's own column shape — EXPERIENCE.md bans the
 * "Loading…" text line, and matching the real row height keeps the layout
 * from shifting when data lands.
 */
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} aria-hidden className="border-b border-gray-200 last:border-b-0">
          {Array.from({ length: COLUMN_COUNT }).map((_, c) => (
            <td key={c} className={clsx('h-[72px]', c === 0 ? 'px-6' : 'px-4')}>
              <div className="h-3.5 rounded bg-gray-100 animate-pulse"
                style={{ width: c === 0 ? '70%' : c === COLUMN_COUNT - 1 ? '30%' : '60%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/**
 * Two-tier: a plain sentence, then the payload behind a disclosure. Rendered
 * instead of — never alongside — the empty state, so an outage cannot read as
 * "you have no invoices".
 */
function ErrorState({ error, company, onRetry }: {
  error: FetchError; company: string; onRetry: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 px-6" aria-live="polite">
      <AlertCircle className="size-8 text-red-500" strokeWidth={1.75} />
      <div className="text-center">
        <p className="text-base font-semibold text-gray-900">Couldn't load invoices.</p>
        <p className="mt-1 text-sm text-gray-500">Something went wrong on our end. Your data is safe.</p>
      </div>
      <button type="button" onClick={onRetry}
        className="px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors cursor-pointer">
        Retry
      </button>
      <details className="w-full max-w-lg">
        <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700 text-center">
          Technical details
        </summary>
        <pre className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs font-mono text-gray-600 whitespace-pre-wrap">
          {`code:    ${error.code}\nsurface: /billing/invoices\ncompany: ${company}\ntime:    ${error.at}\n\n${error.message}`}
        </pre>
      </details>
    </div>
  )
}

function EmptyState({ isFiltered, company, noCompany, onAdd, onClear }: {
  isFiltered: boolean; company: string; noCompany: boolean; onAdd: () => void; onClear: () => void
}) {
  if (noCompany) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <FileText className="size-8 text-gray-400" strokeWidth={1.75} />
        <p className="text-base font-semibold text-gray-900">No company selected</p>
        <p className="text-sm text-gray-500">
          Pick a company from the sidebar to see its invoices.
        </p>
      </div>
    )
  }
  return (
    <div className="relative flex flex-col items-center justify-center py-20 overflow-hidden">
      <div className="absolute inset-0 opacity-50" style={{
        backgroundImage: 'linear-gradient(to right, var(--color-gray-200) 1px, transparent 1px), linear-gradient(to bottom, var(--color-gray-200) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        WebkitMaskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, black 40%, transparent 100%)',
        maskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, black 40%, transparent 100%)',
      }} />
      <div className="relative flex flex-col items-center gap-4">
        <div className="size-20 rounded-full bg-gray-100 flex items-center justify-center">
          <div className="size-12 rounded-full bg-gray-700/60 backdrop-blur-sm flex items-center justify-center">
            <FileText className="size-6 text-white" strokeWidth={1.75} />
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-gray-900">
            {isFiltered ? 'No invoices match your filters' : `No invoices in ${company}`}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {isFiltered
              ? `Nothing in ${company} matches the current search or date range.`
              : <>There are no invoices yet. Start by clicking the <strong>Add invoice</strong> button above.</>}
          </p>
        </div>
        {isFiltered ? (
          <button type="button" onClick={onClear}
            className="px-4 py-2.5 border border-gray-300 bg-white text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
            Clear filters
          </button>
        ) : (
          <button type="button" onClick={onAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors cursor-pointer">
            <Plus className="size-4" strokeWidth={2.5} />Add invoice
          </button>
        )}
      </div>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const navigate = useNavigate()
  const { showToast, showError } = useToast()
  const company = useActiveCompany()
  const { profile } = useAuth()
  const companyName = company?.name ?? 'this company'

  const [rows, setRows] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<FetchError | null>(null)
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)

  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const companyId = company?.id ?? null

  /** `reset` clears selection and paging — used when the active company changes,
   *  so a stale selection cannot carry across tenants. */
  const fetchData = useCallback(async (reset = false) => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, customer_name, status, total, amount_paid, outstanding, invoice_bookings(bookings(booking_ref))')
      .order('invoice_date', { ascending: false })
      .order('id', { ascending: false })

    if (err) {
      // Error takes precedence over empty: setting error and leaving `rows`
      // alone means a failed fetch never masquerades as "no invoices".
      console.error('[invoices] fetch failed:', err.message)
      setError({ message: err.message, code: err.code ?? 'unknown', at: new Date().toISOString() })
      setLoading(false)
      return
    }

    setError(null)
    setRows((data ?? []).map((r: any) => ({
      id: r.id,
      invoiceNumber: r.invoice_number,
      invoiceDate: r.invoice_date,
      customerName: r.customer_name,
      status: r.status as InvoiceStatus,
      total: Number(r.total ?? 0),
      amountPaid: Number(r.amount_paid ?? 0),
      outstanding: Number(r.outstanding ?? 0),
      bookingRefs: (r.invoice_bookings ?? [])
        .map((ib: any) => ib.bookings?.booking_ref)
        .filter(Boolean),
    })))
    if (reset) {
      setSelected(new Set())
      setPage(1)
    }
    setLoading(false)
  }, [])

  // Keyed on the active company: every other list page passes [] here and so
  // keeps showing the previous tenant's rows after a switch. Deliberately not
  // gated on a company being set — with none, RLS returns zero rows and the
  // empty state says so. Skipping the fetch would strand the page on skeletons.
  useEffect(() => {
    void fetchData(true)
  }, [companyId, fetchData])

  // ── filtering ──────────────────────────────────────────────────────────────

  const filtered = rows.filter(r => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q
      || r.customerName.toLowerCase().includes(q)
      || r.invoiceNumber.toLowerCase().includes(q)
      || r.bookingRefs.some(ref => ref.toLowerCase().includes(q))

    if (!matchesSearch) return false
    if (!dateRange) return true

    const d = new Date(r.invoiceDate + 'T00:00:00')
    return d >= dateRange.start && d <= dateRange.end
  })

  const isFiltered = search.trim().length > 0 || dateRange != null
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const allSelected = pageRows.length > 0 && pageRows.every(r => selected.has(r.id))
  const someSelected = pageRows.some(r => selected.has(r.id)) && !allSelected

  function toggleRow(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) pageRows.forEach(r => next.delete(r.id))
      else pageRows.forEach(r => next.add(r.id))
      return next
    })
  }

  function clearFilters() {
    setSearch('')
    setDateRange(null)
    setPage(1)
  }

  // ── mutations ──────────────────────────────────────────────────────────────

  async function cancelInvoice(invoice: Invoice) {
    const { error: err } = await supabase
      .from('invoices')
      .update({ status: 'Cancelled' })
      .eq('id', invoice.id)
    if (err) {
      console.error('[invoices] cancel failed:', err.message)
      showError(`Couldn't cancel ${invoice.invoiceNumber}. ${err.message}`)
      return
    }
    await fetchData()
    showToast(`${invoice.invoiceNumber} cancelled`)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    // invoice_bookings and invoice_lines cascade from their FK.
    const { error: err } = await supabase.from('invoices').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (err) {
      console.error('[invoices] delete failed:', err.message)
      showError(`Couldn't delete ${deleteTarget.invoiceNumber}. ${err.message}`)
      return
    }
    const number = deleteTarget.invoiceNumber
    setDeleteTarget(null)
    await fetchData()
    showToast(`${number} deleted`)
  }

  async function handleBulkDelete() {
    const ids = [...selected]
    setDeleting(true)
    const { error: err } = await supabase.from('invoices').delete().in('id', ids)
    setDeleting(false)
    if (err) {
      console.error('[invoices] bulk delete failed:', err.message)
      showError(`Couldn't delete the selected invoices. ${err.message}`)
      return
    }
    setBulkDeleteOpen(false)
    setSelected(new Set())
    await fetchData()
    showToast(`${ids.length} invoice${ids.length === 1 ? '' : 's'} deleted`)
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* Header + filters */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[30px] font-semibold leading-[38px] text-gray-900">Invoices</h2>
          <p className="mt-1 text-base text-gray-500">Create and manage your invoices here</p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
            <label htmlFor="invoice-search" className="sr-only">Search invoices</label>
            <input
              id="invoice-search"
              type="text"
              placeholder="Search by customer, booking or number"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-[38px] pr-3.5 py-2.5 w-[400px] border border-gray-300 rounded-lg shadow-xs text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
            />
          </div>

          <DateRangePicker
            value={dateRange}
            onChange={r => { setDateRange(r); setPage(1) }}
            placeholder="Select dates"
          />

          <div className="w-px h-8 bg-gray-200" />

          {selected.size > 0 ? (
            <button type="button" onClick={() => setBulkDeleteOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg shadow-xs hover:bg-red-700 transition-colors cursor-pointer">
              <Trash2 className="size-4" strokeWidth={2.5} />Delete {selected.size} selected
            </button>
          ) : (
            <button type="button" onClick={() => navigate('/billing/invoices/create')}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg shadow-xs hover:bg-violet-700 transition-colors cursor-pointer">
              <Plus className="size-4" strokeWidth={2.5} />Add invoice
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
        <table className="w-full border-collapse" aria-busy={loading}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="h-[44px] px-6 text-left w-[250px]">
                <div className="flex items-center gap-3">
                  <IndeterminateCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-600">
                    Number <ChevronDown className="size-3.5 shrink-0" strokeWidth={1.75} />
                  </span>
                </div>
              </th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600 w-[128px]">Invoice date</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600">Customer</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600 w-[136px]">Booking ID</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600 w-[124px]">Total amount</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600 w-[124px]">Amount paid</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600 w-[124px]">Outstanding</th>
              <th className="h-[44px] px-4 text-left text-xs font-medium text-gray-600 w-[128px]">Status</th>
              <th className="h-[44px] w-[68px]" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows />
            ) : error ? (
              <tr><td colSpan={COLUMN_COUNT}>
                <ErrorState error={error} company={companyName} onRetry={fetchData} />
              </td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={COLUMN_COUNT}>
                <EmptyState
                  isFiltered={isFiltered}
                  company={companyName}
                  noCompany={profile != null && profile.activeCompanyId == null}
                  onAdd={() => navigate('/billing/invoices/create')}
                  onClear={clearFilters}
                />
              </td></tr>
            ) : pageRows.map(row => (
              <tr key={row.id}
                onClick={() => navigate(`/billing/invoices/${row.id}`)}
                className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer">
                <td className="h-[72px] px-6 py-4">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selected.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      onClick={e => e.stopPropagation()}
                      aria-label={`Select ${row.invoiceNumber}`}
                      className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer shrink-0" />
                    <span className="text-sm font-medium text-gray-900">{row.invoiceNumber}</span>
                  </div>
                </td>
                <td className="h-[72px] px-4 py-4 text-sm text-gray-500">{formatDate(row.invoiceDate)}</td>
                <td className="h-[72px] px-4 py-4 text-sm text-gray-500">{row.customerName}</td>
                <td className="h-[72px] px-4 py-4">
                  {row.bookingRefs.length === 0 ? (
                    <span className="text-sm text-gray-400">—</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-gray-500">{row.bookingRefs[0]}</span>
                      {row.bookingRefs.length > 1 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                          +{row.bookingRefs.length - 1}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="h-[72px] px-4 py-4 text-sm text-gray-700">{formatINR(row.total)}</td>
                <td className="h-[72px] px-4 py-4 text-sm text-gray-500">{formatINR(row.amountPaid)}</td>
                <td className="h-[72px] px-4 py-4 text-sm text-gray-500">{formatINR(row.outstanding)}</td>
                <td className="h-[72px] px-4 py-4"><StatusBadge status={row.status} /></td>
                <td className="h-[72px] p-4" onClick={e => e.stopPropagation()}>
                  <RowMenu items={getInvoiceActions(row, {
                    onView: () => navigate(`/billing/invoices/${row.id}`),
                    onEdit: () => navigate(`/billing/invoices/${row.id}/edit`),
                    onCancel: () => cancelInvoice(row),
                    onDelete: () => setDeleteTarget(row),
                  })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && !error && totalPages > 1 && (
          <div className="border-t border-gray-200 flex items-center justify-between px-6 pt-3 pb-4">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white shadow-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
              <ChevronLeft className="size-5" strokeWidth={1.75} /> Previous
            </button>
            <div className="flex items-center gap-0.5">
              {getPaginationPages(page, totalPages).map((p, i) => (
                <button key={i} type="button" onClick={() => typeof p === 'number' && setPage(p)} disabled={p === '...'}
                  className={clsx(
                    'size-10 rounded-lg text-sm font-medium flex items-center justify-center transition-colors cursor-pointer',
                    p === page ? 'bg-gray-50 text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-50',
                    p === '...' && 'cursor-default pointer-events-none',
                  )}>
                  {p}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white shadow-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
              Next <ChevronRight className="size-5" strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>

      <ConfirmDeleteModal
        open={deleteTarget !== null}
        title="Delete invoice"
        description={`${deleteTarget?.invoiceNumber ?? ''} and its line items will be permanently deleted. This cannot be undone.`}
        deleting={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <ConfirmDeleteModal
        open={bulkDeleteOpen}
        title={`Delete ${selected.size} invoice${selected.size === 1 ? '' : 's'}`}
        description="The selected invoices and their line items will be permanently deleted. This cannot be undone."
        deleting={deleting}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
      />
    </div>
  )
}
