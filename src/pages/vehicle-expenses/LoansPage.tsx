import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'

// ── types ──────────────────────────────────────────────────────────────────────

interface LoanEntry {
  id: number
  vehicleName: string
  vehicleNumber: string
  bankName: string | null
  emiAmount: number | null
  loanStartDate: string | null
  loanEndDate: string | null
  emiDay: number | null
}

// ── helpers ────────────────────────────────────────────────────────────────────

function formatINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN')
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function nextEmiDate(emiDay: number | null, endDate: string | null): string {
  if (!emiDay) return '—'
  const today = new Date()
  if (endDate && new Date(endDate) < today) return 'Loan closed'
  const d = new Date(today.getFullYear(), today.getMonth(), emiDay)
  if (d <= today) d.setMonth(d.getMonth() + 1)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function loanPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  return `${formatDate(start)} → ${formatDate(end)}`
}

function getPaginationPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, '...', total - 2, total - 1, total]
  if (current >= total - 2) return [1, '...', current - 2, current - 1, current, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}

const PAGE_SIZE = 8

// ── empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
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
          <p className="text-base font-semibold text-gray-900">No active loans</p>
          <p className="mt-1 text-sm text-gray-500">Add loan details to a vehicle from the Database section.</p>
        </div>
      </div>
    </div>
  )
}

// ── page ───────────────────────────────────────────────────────────────────────

export default function LoansPage() {
  const [rows,   setRows]   = useState<LoanEntry[]>([])
  const [search, setSearch] = useState('')
  const [page,   setPage]   = useState(1)

  useEffect(() => {
    supabase
      .from('vehicles')
      .select('id, model_name, vehicle_number, loan_bank_name, loan_emi_amount, loan_start_date, loan_end_date, loan_emi_date')
      .eq('has_loan', true)
      .order('model_name')
      .then(({ data }) => {
        if (data) setRows(data.map((v: any) => ({
          id:            v.id,
          vehicleName:   v.model_name,
          vehicleNumber: v.vehicle_number,
          bankName:      v.loan_bank_name,
          emiAmount:     v.loan_emi_amount != null ? Number(v.loan_emi_amount) : null,
          loanStartDate: v.loan_start_date,
          loanEndDate:   v.loan_end_date,
          emiDay:        v.loan_emi_date != null ? Number(v.loan_emi_date) : null,
        })))
      })
  }, [])

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    return !q || r.vehicleName.toLowerCase().includes(q) || r.vehicleNumber.toLowerCase().includes(q)
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* Section header */}
      <div className="flex items-center justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Loans</h2>
          <p className="mt-1 text-sm text-gray-500">Ongoing loans for all your vehicles</p>
        </div>
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
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="h-[44px] px-6 text-left text-xs font-medium text-gray-500 border-r border-gray-200">
                Vehicle Name and Number
              </th>
              <th className="h-[44px] px-6 text-left text-xs font-medium text-gray-500">Bank</th>
              <th className="h-[44px] px-6 text-left text-xs font-medium text-gray-500">EMI Amount</th>
              <th className="h-[44px] px-6 text-left text-xs font-medium text-gray-500">Loan Period</th>
              <th className="h-[44px] px-6 text-left text-xs font-medium text-gray-500">Next EMI Date</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={5}><EmptyState /></td></tr>
            ) : pageRows.map(row => (
              <tr key={row.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors">
                <td className="h-[72px] px-6 py-4 border-r border-gray-200">
                  <p className="text-sm font-medium text-gray-900">{row.vehicleName}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{row.vehicleNumber}</p>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{row.bankName || '—'}</td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {row.emiAmount != null ? formatINR(row.emiAmount) : '—'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{loanPeriod(row.loanStartDate, row.loanEndDate)}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{nextEmiDate(row.emiDay, row.loanEndDate)}</td>
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

    </div>
  )
}
