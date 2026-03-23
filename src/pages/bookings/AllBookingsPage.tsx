import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, Trash2, MoreHorizontal, ChevronDown,
  ChevronLeft, ChevronRight, Calendar,
} from 'lucide-react'
import { clsx } from 'clsx'
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal'

// ── types ─────────────────────────────────────────────────────────────────────

type BookingStatus = 'Booked' | 'On-Going' | 'Completed' | 'Billed' | 'Cancelled'
type StatusFilter  = 'All' | BookingStatus

interface Booking {
  id: number
  startDate: string
  endDate: string
  customer: string
  passenger: string
  passengerExtra?: number
  vehicleGroup: string
  dutyType: string
  duties: string
  status: BookingStatus
}

// ── mock data ─────────────────────────────────────────────────────────────────

const MOCK_BOOKINGS: Booking[] = [
  { id: 1, startDate: '28/10/2024', endDate: '12/06/2024', customer: 'Apple',              passenger: 'Marjorie', vehicleGroup: 'Toyota Innova',       dutyType: '250KM per day', duties: '0/1', status: 'Booked'    },
  { id: 2, startDate: '16/08/2024', endDate: '09/04/2024', customer: 'Larsen and Turbo',   passenger: 'Kyle',     passengerExtra: 2, vehicleGroup: 'Dzire/Amaze/Etios',  dutyType: '300KM per day', duties: '0/1', status: 'Booked'    },
  { id: 3, startDate: '18/09/2024', endDate: '30/04/2024', customer: 'Mahindra',           passenger: 'Darlene', vehicleGroup: 'Nissan Hatchbacks',  dutyType: '250KM per day', duties: '0/2', status: 'Booked'    },
  { id: 4, startDate: '16/08/2024', endDate: '15/05/2024', customer: 'Lawyers association',passenger: 'Colleen',  passengerExtra: 1, vehicleGroup: 'MG Hector/MG Titan',  dutyType: '4H 40KMs',      duties: '0/1', status: 'Booked'    },
  { id: 5, startDate: '12/06/2024', endDate: '31/03/2024', customer: 'Expedia services',   passenger: 'Eduardo',  passengerExtra: 3, vehicleGroup: 'Mercedes Sedans',     dutyType: '4H 40KMs',      duties: '0/3', status: 'On-Going'  },
  { id: 6, startDate: '18/09/2024', endDate: '11/07/2024', customer: 'Lawyers association',passenger: 'Ann',      vehicleGroup: 'Toyota Sedans',       dutyType: '6H 60KMs',      duties: '0/1', status: 'Completed' },
  { id: 7, startDate: '18/09/2024', endDate: '11/07/2024', customer: 'Lawyers association',passenger: 'Ann',      vehicleGroup: 'Toyota Sedans',       dutyType: '6H 60KMs',      duties: '0/1', status: 'Billed'    },
  { id: 8, startDate: '15/08/2024', endDate: '16/06/2024', customer: 'Holceim',            passenger: 'Greg',     passengerExtra: 5, vehicleGroup: 'Maruti Hatchbacks',   dutyType: '6H 60KMs',      duties: '0/4', status: 'Cancelled' },
]

const STATUS_TABS: StatusFilter[] = ['All', 'Booked', 'On-Going', 'Completed', 'Billed', 'Cancelled']
const PAGE_SIZE = 8

// ── helpers ───────────────────────────────────────────────────────────────────

function getPaginationPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, '...', total - 2, total - 1, total]
  if (current >= total - 2) return [1, 2, 3, '...', total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}

// ── sub-components ────────────────────────────────────────────────────────────

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

function StatusBadge({ status }: { status: BookingStatus }) {
  const cfg: Record<BookingStatus, { dot: string; cls: string }> = {
    'Booked':    { dot: 'bg-gray-400',  cls: 'text-gray-600' },
    'On-Going':  { dot: 'bg-blue-500',  cls: 'text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full' },
    'Completed': { dot: 'bg-green-500', cls: 'text-green-700 bg-green-50 px-2 py-0.5 rounded-full' },
    'Billed':    { dot: 'bg-green-500', cls: 'text-green-700 bg-green-50 px-2 py-0.5 rounded-full' },
    'Cancelled': { dot: 'bg-red-500',   cls: 'text-red-700 bg-red-50 px-2 py-0.5 rounded-full' },
  }
  const { dot, cls } = cfg[status]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium', cls)}>
      <span className={clsx('size-1.5 rounded-full shrink-0', dot)} />
      {status}
    </span>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function AllBookingsPage() {
  const navigate = useNavigate()

  const [rows, setRows]               = useState<Booking[]>(MOCK_BOOKINGS)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState<Set<number>>(new Set())
  const [page, setPage]               = useState(1)
  const [dateRange, setDateRange]     = useState<{ start: string; end: string } | null>(
    { start: 'Jan 12, 2024', end: 'Jan 18, 2024' },
  )
  const [deleteTarget, setDeleteTarget] = useState<Booking | null>(null)

  // filtering
  const filtered = rows.filter(b => {
    const matchesStatus = statusFilter === 'All' || b.status === statusFilter
    const q = search.toLowerCase()
    const matchesSearch =
      !q ||
      b.customer.toLowerCase().includes(q) ||
      b.passenger.toLowerCase().includes(q) ||
      b.dutyType.toLowerCase().includes(q) ||
      b.vehicleGroup.toLowerCase().includes(q)
    return matchesStatus && matchesSearch
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
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
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSearch(value: string) { setSearch(value); setPage(1) }
  function handleStatusFilter(tab: StatusFilter) { setStatusFilter(tab); setPage(1) }

  function handleDelete() {
    if (!deleteTarget) return
    setSelected(prev => { const next = new Set(prev); next.delete(deleteTarget.id); return next })
    setRows(prev => prev.filter(r => r.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  return (
    <div className="px-10 py-8 flex flex-col gap-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold leading-[38px] text-gray-900">Bookings</h1>
          <p className="text-sm text-gray-500">Create and manage your bookings from here</p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => navigate('/bookings/duties')}
            className="px-4 py-2.5 border border-violet-300 rounded-lg bg-white text-sm font-semibold text-violet-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-violet-50 transition-colors cursor-pointer"
          >
            All Duties
          </button>
          <button
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#7f56d9] text-white text-sm font-semibold rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-[#6941c6] transition-colors cursor-pointer"
          >
            <Plus className="size-4" strokeWidth={2.5} />
            Add Booking
          </button>
        </div>
      </div>

      {/* ── Status filter tabs ── */}
      <div className="flex items-center gap-0.5 p-1 bg-gray-100 rounded-lg w-fit">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => handleStatusFilter(tab)}
            className={clsx(
              'px-3.5 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer',
              statusFilter === tab
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Search + date filter ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Search by name, number, duty type, city or booking id"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-[38px] pr-3.5 py-2.5 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="flex items-center gap-2 px-3.5 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap">
            <Calendar className="size-4 text-gray-500 shrink-0" strokeWidth={1.75} />
            {dateRange ? `${dateRange.start} – ${dateRange.end}` : 'Select date range'}
          </button>
          {dateRange && (
            <button
              onClick={() => setDateRange(null)}
              className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <IndeterminateCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
                  <button className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer transition-colors">
                    Start date <ChevronDown className="size-3.5 shrink-0" strokeWidth={1.75} />
                  </button>
                </div>
              </th>
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Customer</span>
              </th>
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Passenger</span>
              </th>
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Vehicle group</span>
              </th>
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Duty type</span>
              </th>
              <th className="h-[44px] px-6 text-left w-[90px] border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Duties</span>
              </th>
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Status</span>
              </th>
              <th className="h-[44px] w-[80px] border-b border-gray-200" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(row => (
              <tr
                key={row.id}
                className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                {/* Date */}
                <td className="h-[72px] px-6 py-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      onClick={e => e.stopPropagation()}
                      className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer shrink-0"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{row.startDate}</p>
                      <p className="text-xs text-gray-400 mt-0.5">to {row.endDate}</p>
                    </div>
                  </div>
                </td>

                {/* Customer */}
                <td className="h-[72px] px-6 py-4 text-sm text-gray-700">{row.customer}</td>

                {/* Passenger */}
                <td className="h-[72px] px-6 py-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-gray-700">{row.passenger}</span>
                    {row.passengerExtra !== undefined && (
                      <span className="text-xs font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md leading-none">
                        +{row.passengerExtra}
                      </span>
                    )}
                  </div>
                </td>

                {/* Vehicle group */}
                <td className="h-[72px] px-6 py-4 text-sm text-gray-700">{row.vehicleGroup}</td>

                {/* Duty type */}
                <td className="h-[72px] px-6 py-4 text-sm text-gray-700">{row.dutyType}</td>

                {/* Duties */}
                <td className="h-[72px] px-6 py-4 text-sm text-gray-500">{row.duties}</td>

                {/* Status */}
                <td className="h-[72px] px-6 py-4">
                  <StatusBadge status={row.status} />
                </td>

                {/* Actions */}
                <td className="h-[72px] p-4">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteTarget(row) }}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      <Trash2 className="size-5" strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={e => e.stopPropagation()}
                      className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      <MoreHorizontal className="size-5" strokeWidth={1.75} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {pageRows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-gray-400">
                  No bookings match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="border-t border-gray-200 flex items-center justify-between px-6 pt-3 pb-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <ChevronLeft className="size-5" strokeWidth={1.75} /> Previous
          </button>
          <div className="flex items-center gap-0.5">
            {getPaginationPages(page, totalPages).map((p, i) => (
              <button
                key={i}
                onClick={() => typeof p === 'number' && setPage(p)}
                disabled={p === '...'}
                className={clsx(
                  'size-10 rounded-lg text-sm font-medium flex items-center justify-center transition-colors',
                  p === page ? 'bg-gray-50 text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-50',
                  p === '...' && 'cursor-default pointer-events-none',
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Next <ChevronRight className="size-5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDeleteModal
        open={deleteTarget !== null}
        title="Delete booking"
        description={
          deleteTarget
            ? `Are you sure you want to delete the booking for "${deleteTarget.customer}"? This action cannot be undone.`
            : ''
        }
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
