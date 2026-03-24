import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Plus, Pencil, MoreHorizontal, Search,
  ChevronLeft, ChevronRight, ChevronDown, Eye, Truck, UserMinus,
  Trash2, RotateCcw, CheckCircle, XCircle, RefreshCw, UserX,
  Send, FileText, Printer,
} from 'lucide-react'
import { clsx } from 'clsx'
import StatusBadge from '../../components/ui/StatusBadge'
import type { BookingStatus } from '../../components/ui/StatusBadge'
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal'
import DateRangePicker from '../../components/ui/DateRangePicker'
import type { DateRange } from '../../components/ui/DateRangePicker'
import DutyDrawer from './DutyDrawer'
import type { DutyDrawerMode } from './DutyDrawer'
import AllotDrawer from './AllotDrawer'
import type { AllotDutyInfo } from './AllotDrawer'
import { useToast } from '../../components/ui/Toast'

// ── types ─────────────────────────────────────────────────────────────────────

type DutyStatus = Extract<BookingStatus, 'Booked' | 'Allotted' | 'Dispatched' | 'Completed' | 'Billed' | 'Cancelled' | 'Unconfirmed'>
type DutyFilter = 'All' | 'Upcoming' | DutyStatus

interface Driver {
  initials: string
  name: string
  color: string
}

interface Duty {
  id: number
  date: string
  customer: string
  passenger: string
  passengerExtra?: number
  vehicleName?: string
  vehicleNumber?: string
  vehicleGroup?: string
  dutyType: string
  driver?: Driver
  repTime: string
  status: DutyStatus
}

// ── mock data ─────────────────────────────────────────────────────────────────

const MOCK_DUTIES: Duty[] = [
  { id: 1, date: '28/10/2024', customer: 'Mahindra', passenger: 'Kyle', passengerExtra: 2, vehicleName: undefined,          vehicleNumber: undefined,    vehicleGroup: 'Maruti Hatchbacks',  dutyType: '250KM per day', driver: undefined,                                          repTime: '16:00', status: 'Booked'      },
  { id: 2, date: '16/08/2024', customer: 'Mahindra', passenger: 'Kyle', passengerExtra: 2, vehicleName: undefined,          vehicleNumber: undefined,    vehicleGroup: 'Dzire/Amaze/Etios',  dutyType: '250KM per day', driver: undefined,                                          repTime: '16:00', status: 'Booked'      },
  { id: 3, date: '18/09/2024', customer: 'Mahindra', passenger: 'Kyle', passengerExtra: 2, vehicleName: undefined,          vehicleNumber: undefined,    vehicleGroup: 'Toyota Innova',       dutyType: '250KM per day', driver: undefined,                                          repTime: '16:00', status: 'Booked'      },
  { id: 4, date: '16/08/2024', customer: 'Mahindra', passenger: 'Kyle', passengerExtra: 2, vehicleName: 'Toyota Innova',    vehicleNumber: 'MH01 4646',  dutyType: '250KM per day', driver: { initials: 'JD', name: 'John Dukes',     color: 'bg-violet-100 text-violet-700' }, repTime: '16:00', status: 'Allotted'    },
  { id: 5, date: '12/06/2024', customer: 'Mahindra', passenger: 'Kyle', passengerExtra: 2, vehicleName: 'Toyota Innova',    vehicleNumber: 'MH01 4646',  dutyType: '4H 40KMs',      driver: { initials: 'BL', name: 'Bradley Lawlor', color: 'bg-blue-100 text-blue-700'   }, repTime: '10:00', status: 'Dispatched'  },
  { id: 6, date: '18/09/2024', customer: 'Mahindra', passenger: 'Kyle', passengerExtra: 2, vehicleName: 'Maruti Alto',      vehicleNumber: 'MH01 4646',  dutyType: '4H 40KMs',      driver: { initials: 'BL', name: 'Bradley Lawlor', color: 'bg-blue-100 text-blue-700'   }, repTime: '10:00', status: 'Completed'   },
  { id: 7, date: '18/09/2024', customer: 'Mahindra', passenger: 'Kyle', passengerExtra: 2, vehicleName: 'Maruti Alto',      vehicleNumber: 'MH01 4646',  dutyType: '4H 40KMs',      driver: { initials: 'BL', name: 'Bradley Lawlor', color: 'bg-blue-100 text-blue-700'   }, repTime: '10:00', status: 'Billed'      },
  { id: 8, date: '15/08/2024', customer: 'Mahindra', passenger: 'Kyle', passengerExtra: 2, vehicleName: 'Maruti Alto',      vehicleNumber: 'MH01 4646',  dutyType: '4H 40KMs',      driver: { initials: 'BL', name: 'Bradley Lawlor', color: 'bg-blue-100 text-blue-700'   }, repTime: '10:00', status: 'Cancelled'   },
]

const DUTY_TABS: DutyFilter[] = ['All', 'Upcoming', 'Booked', 'Allotted', 'On-Going', 'Completed', 'Billed', 'Cancelled']
const PAGE_SIZE = 8

// ── helpers ───────────────────────────────────────────────────────────────────

function getPaginationPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, '...', total - 2, total - 1, total]
  if (current >= total - 2) return [1, 2, 3, '...', total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}

// ── IndeterminateCheckbox ─────────────────────────────────────────────────────

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

// ── actions menu ─────────────────────────────────────────────────────────────

interface MenuItem { label: string; icon: React.ReactNode; onClick: () => void; variant?: 'default' | 'danger' | 'primary' }

function ActionsMenu({ items }: { items: (MenuItem | 'divider')[] }) {
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
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <MoreHorizontal className="size-5" strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-[240px] bg-white rounded-lg border border-gray-200 shadow-[0px_12px_16px_-4px_rgba(16,24,40,0.08),0px_4px_6px_-2px_rgba(16,24,40,0.03)] py-1">
          {items.map((item, i) =>
            item === 'divider'
              ? <div key={i} className="my-1 border-t border-gray-100" />
              : (
                <button
                  key={i}
                  type="button"
                  onClick={e => { e.stopPropagation(); item.onClick(); setOpen(false) }}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors cursor-pointer',
                    item.variant === 'danger'  && 'text-red-600 hover:bg-red-50',
                    item.variant === 'primary' && 'text-violet-700 font-semibold hover:bg-violet-50',
                    (!item.variant || item.variant === 'default') && 'text-gray-700 hover:bg-gray-50',
                  )}
                >
                  <span className="size-4 shrink-0">{item.icon}</span>
                  {item.label}
                </button>
              )
          )}
        </div>
      )}
    </div>
  )
}

function getDutyActions(
  duty: Duty,
  handlers: {
    onView: () => void
    onEdit: () => void
    onAllot: () => void
    onReAllot: () => void
    onChangeDriver: () => void
    onSendToDriver: () => void
    onClearAllotment: () => void
    onCloseDuty: () => void
    onUnconfirm: () => void
    onConfirm: () => void
    onPreviewSlip: () => void
    onEditSlip: () => void
    onPrintSlip: () => void
    onRestore: () => void
    onCancel: () => void
    onDelete: () => void
  },
): (MenuItem | 'divider')[] {
  const s = duty.status

  if (s === 'Booked') return [
    { label: 'View duty',               icon: <Eye        className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit duty',               icon: <Pencil     className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
    'divider',
    { label: 'Allot vehicle and driver',icon: <Truck      className="size-4" strokeWidth={1.75} />, onClick: handlers.onAllot },
    { label: 'Print duty slip',         icon: <Printer    className="size-4" strokeWidth={1.75} />, onClick: handlers.onPrintSlip },
    'divider',
    { label: 'Unconfirm Duty',          icon: <RotateCcw  className="size-4" strokeWidth={1.75} />, onClick: handlers.onUnconfirm },
    { label: 'Cancel Duty',             icon: <XCircle    className="size-4" strokeWidth={1.75} />, onClick: handlers.onCancel, variant: 'danger' },
  ]

  if (s === 'Allotted' || s === 'Dispatched') return [
    { label: 'View',                        icon: <Eye        className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit',                        icon: <Pencil     className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
    { label: 'Re-allot vehicle & driver',   icon: <RefreshCw  className="size-4" strokeWidth={1.75} />, onClick: handlers.onReAllot },
    { label: 'Change driver',               icon: <UserX      className="size-4" strokeWidth={1.75} />, onClick: handlers.onChangeDriver },
    { label: 'Send info to driver',         icon: <Send       className="size-4" strokeWidth={1.75} />, onClick: handlers.onSendToDriver },
    { label: 'Clear allotment',             icon: <XCircle    className="size-4" strokeWidth={1.75} />, onClick: handlers.onClearAllotment },
    { label: 'Close duty',                  icon: <CheckCircle className="size-4" strokeWidth={1.75} />, onClick: handlers.onCloseDuty, variant: 'primary' },
    { label: 'Unconfirm duty',              icon: <UserMinus  className="size-4" strokeWidth={1.75} />, onClick: handlers.onUnconfirm },
    'divider',
    { label: 'Delete duty',                 icon: <Trash2     className="size-4" strokeWidth={1.75} />, onClick: handlers.onDelete, variant: 'danger' },
  ]

  if (s === 'Completed' || s === 'Billed') return [
    { label: 'View duty',       icon: <Eye      className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Preview duty slip', icon: <FileText className="size-4" strokeWidth={1.75} />, onClick: handlers.onPreviewSlip },
    { label: 'Edit duty slip',  icon: <Pencil   className="size-4" strokeWidth={1.75} />, onClick: handlers.onEditSlip },
    { label: 'Print duty slip', icon: <Printer  className="size-4" strokeWidth={1.75} />, onClick: handlers.onPrintSlip },
  ]

  if (s === 'Cancelled') return [
    { label: 'View duty',      icon: <Eye       className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Restore duty',   icon: <RotateCcw className="size-4" strokeWidth={1.75} />, onClick: handlers.onRestore },
  ]

  if (s === 'Unconfirmed') return [
    { label: 'Confirm duty',   icon: <CheckCircle className="size-4" strokeWidth={1.75} />, onClick: handlers.onConfirm, variant: 'primary' },
    { label: 'View',           icon: <Eye         className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit',           icon: <Pencil      className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
    'divider',
    { label: 'Cancel duty',    icon: <XCircle     className="size-4" strokeWidth={1.75} />, onClick: handlers.onCancel, variant: 'danger' },
  ]

  return []
}

// ── helpers ───────────────────────────────────────────────────────────────────

function dutyToAllotInfo(duty: Duty): AllotDutyInfo {
  return {
    id: duty.id,
    date: duty.date,
    repTime: duty.repTime,
    dutyType: duty.dutyType,
    vehicleGroup: duty.vehicleGroup,
  }
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function BookingDetailPage() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [duties, setDuties]           = useState<Duty[]>(MOCK_DUTIES)
  const [statusFilter, setStatusFilter] = useState<DutyFilter>('All')
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState<Set<number>>(new Set())
  const [page, setPage]               = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<Duty | null>(null)
  const [dateRange, setDateRange]       = useState<DateRange | null>(null)
  const [dutyDrawer, setDutyDrawer]     = useState<{ open: boolean; mode: DutyDrawerMode; duty: Duty | null }>({
    open: false, mode: 'add', duty: null,
  })

  function openDutyDrawer(mode: DutyDrawerMode, duty: Duty | null = null) {
    setDutyDrawer({ open: true, mode, duty })
  }
  function closeDutyDrawer() {
    setDutyDrawer(prev => ({ ...prev, open: false }))
  }

  const [allotDuty, setAllotDuty] = useState<Duty | null>(null)

  function openAllotDrawer(duty: Duty) { setAllotDuty(duty) }
  function closeAllotDrawer() { setAllotDuty(null) }

  const filtered = duties.filter(d => {
    if (statusFilter === 'Upcoming') {
      if (d.status !== 'Booked' && d.status !== 'Allotted') return false
    } else if (statusFilter !== 'All') {
      if (d.status !== statusFilter) return false
    }
    const q = search.toLowerCase()
    if (q && !d.customer.toLowerCase().includes(q) && !d.passenger.toLowerCase().includes(q) && !d.dutyType.toLowerCase().includes(q)) return false
    if (dateRange) {
      const [dd, mm, yyyy] = d.date.split('/')
      const start = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
      if (start < dateRange.start || start > dateRange.end) return false
    }
    return true
  })

  const totalPages   = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows     = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const allSelected  = pageRows.length > 0 && pageRows.every(r => selected.has(r.id))
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
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function updateDutyStatus(id: number, status: DutyStatus) {
    setDuties(prev => prev.map(d => d.id === id ? { ...d, status } : d))
  }

  function handleDelete() {
    if (!deleteTarget) return
    setSelected(prev => { const next = new Set(prev); next.delete(deleteTarget.id); return next })
    setDuties(prev => prev.filter(d => d.id !== deleteTarget.id))
    setDeleteTarget(null)
    showToast('Duty deleted successfully')
  }

  return (
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* ── Header ── */}
      <div className="border-b border-gray-200 pb-5">
        {/* Back link */}
        <button
          onClick={() => navigate('/bookings/all')}
          className="flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:text-violet-800 mb-3 cursor-pointer transition-colors"
        >
          <ArrowLeft className="size-4" strokeWidth={2} />
          Back to all bookings
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-semibold leading-[38px] text-gray-900">
              Booking ID: {bookingId}
            </h1>
            <p className="text-base font-normal text-gray-500 leading-6 mt-0.5">
              12/06/2024 to 18/06/2024
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-1">
            <button
              onClick={() => openDutyDrawer('add')}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-violet-300 rounded-lg bg-white text-sm font-semibold text-violet-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-violet-50 transition-colors cursor-pointer"
            >
              <Plus className="size-4" strokeWidth={2.5} />
              Add Duty
            </button>
            <button className="flex items-center gap-1.5 px-4 py-2.5 border border-violet-300 rounded-lg bg-white text-sm font-semibold text-violet-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-violet-50 transition-colors cursor-pointer">
              <Pencil className="size-4" strokeWidth={1.75} />
              Edit
            </button>
            <button className="p-2.5 border border-gray-300 rounded-lg bg-white text-gray-500 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 transition-colors cursor-pointer">
              <MoreHorizontal className="size-5" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Status filter tabs ── */}
      <div className="flex items-center gap-0.5 p-1 bg-gray-100 rounded-lg w-fit">
        {DUTY_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => { setStatusFilter(tab); setPage(1) }}
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

      {/* ── Search + date ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Search by name, number, duty type, city or booking id"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-[38px] pr-3.5 py-2.5 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
          />
        </div>
        <DateRangePicker value={dateRange} onChange={r => { setDateRange(r); setPage(1) }} />
        {dateRange && (
          <button
            onClick={() => { setDateRange(null); setPage(1) }}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer shrink-0"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <IndeterminateCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
                  <button className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer transition-colors whitespace-nowrap">
                    Duties date <ChevronDown className="size-3.5 shrink-0" strokeWidth={1.75} />
                  </button>
                </div>
              </th>
              <th className="h-[44px] px-4 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Customer</span>
              </th>
              <th className="h-[44px] px-4 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Passenger</span>
              </th>
              <th className="h-[44px] px-4 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Vehicle</span>
              </th>
              <th className="h-[44px] px-4 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Duty type</span>
              </th>
              <th className="h-[44px] px-4 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Driver</span>
              </th>
              <th className="h-[44px] px-4 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Rep. Time</span>
              </th>
              <th className="h-[44px] px-4 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Status</span>
              </th>
              <th className="h-[44px] w-[52px] border-b border-gray-200" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(row => (
              <tr
                key={row.id}
                className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors"
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
                    <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{row.date}</span>
                  </div>
                </td>

                {/* Customer */}
                <td className="h-[72px] px-4 py-4 text-sm text-gray-700">{row.customer}</td>

                {/* Passenger */}
                <td className="h-[72px] px-4 py-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-gray-700">{row.passenger}</span>
                    {row.passengerExtra !== undefined && (
                      <span className="text-xs font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md leading-none">
                        +{row.passengerExtra}
                      </span>
                    )}
                  </div>
                </td>

                {/* Vehicle */}
                <td className="h-[72px] px-4 py-4">
                  {row.vehicleName ? (
                    <div>
                      <p className="text-sm text-gray-900">{row.vehicleName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{row.vehicleNumber}</p>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </td>

                {/* Duty type */}
                <td className="h-[72px] px-4 py-4 text-sm text-gray-700 whitespace-nowrap">{row.dutyType}</td>

                {/* Driver */}
                <td className="h-[72px] px-4 py-4">
                  {row.driver ? (
                    <div className="flex items-center gap-2">
                      <span className={clsx('size-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0', row.driver.color)}>
                        {row.driver.initials}
                      </span>
                      <span className="text-sm text-gray-700 whitespace-nowrap">{row.driver.name}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </td>

                {/* Rep. Time */}
                <td className="h-[72px] px-4 py-4 text-sm text-gray-700">{row.repTime}</td>

                {/* Status */}
                <td className="h-[72px] px-4 py-4">
                  <StatusBadge status={row.status} />
                </td>

                {/* Actions */}
                <td className="h-[72px] px-3 py-4">
                  <ActionsMenu
                    items={getDutyActions(row, {
                      onView:          () => openDutyDrawer('view', row),
                      onEdit:          () => openDutyDrawer('edit', row),
                      onAllot:         () => openAllotDrawer(row),
                      onReAllot:       () => {},
                      onChangeDriver:  () => {},
                      onSendToDriver:  () => {},
                      onClearAllotment:() => { updateDutyStatus(row.id, 'Booked'); showToast('Allotment cleared') },
                      onCloseDuty:     () => { updateDutyStatus(row.id, 'Completed'); showToast('Duty closed successfully') },
                      onUnconfirm:     () => { updateDutyStatus(row.id, 'Unconfirmed'); showToast('Duty moved to Unconfirmed') },
                      onConfirm:       () => { updateDutyStatus(row.id, 'Booked'); showToast('Duty confirmed successfully') },
                      onPreviewSlip:   () => {},
                      onEditSlip:      () => {},
                      onPrintSlip:     () => {},
                      onRestore:       () => { updateDutyStatus(row.id, 'Booked'); showToast('Duty restored successfully') },
                      onCancel:        () => { updateDutyStatus(row.id, 'Cancelled'); showToast('Duty cancelled') },
                      onDelete:        () => setDeleteTarget(row),
                    })}
                  />
                </td>
              </tr>
            ))}

            {pageRows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-16 text-center text-sm text-gray-400">
                  No duties match your search.
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

      <ConfirmDeleteModal
        open={deleteTarget !== null}
        title="Delete duty"
        description={deleteTarget ? `Are you sure you want to delete this duty on ${deleteTarget.date}? This action cannot be undone.` : ''}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <DutyDrawer
        open={dutyDrawer.open}
        mode={dutyDrawer.mode}
        initial={dutyDrawer.duty ? {
          dutyType: dutyDrawer.duty.dutyType,
          vehicleGroup: dutyDrawer.duty.vehicleGroup ?? '',
          reportingTime: dutyDrawer.duty.repTime,
          startDate: dutyDrawer.duty.date
            ? (() => { const [dd, mm, yyyy] = dutyDrawer.duty!.date.split('/'); return `${yyyy}-${mm}-${dd}` })()
            : '',
          endDate: dutyDrawer.duty.date
            ? (() => { const [dd, mm, yyyy] = dutyDrawer.duty!.date.split('/'); return `${yyyy}-${mm}-${dd}` })()
            : '',
        } : undefined}
        onClose={closeDutyDrawer}
        onSave={form => {
          const isAdd = dutyDrawer.mode === 'add'
          // Convert YYYY-MM-DD → DD/MM/YYYY for display
          const toDisplay = (iso: string) => {
            if (!iso) return ''
            const [yyyy, mm, dd] = iso.split('-')
            return `${dd}/${mm}/${yyyy}`
          }
          if (isAdd) {
            const newDuty: Duty = {
              id: Date.now(),
              date: toDisplay(form.startDate),
              customer: '',
              passenger: '',
              vehicleGroup: form.vehicleGroup,
              dutyType: form.dutyType,
              repTime: form.reportingTime,
              status: 'Booked',
            }
            setDuties(prev => [newDuty, ...prev])
          } else if (dutyDrawer.duty) {
            const id = dutyDrawer.duty.id
            setDuties(prev => prev.map(d => d.id === id ? {
              ...d,
              date: toDisplay(form.startDate) || d.date,
              vehicleGroup: form.vehicleGroup || d.vehicleGroup,
              dutyType: form.dutyType || d.dutyType,
              repTime: form.reportingTime || d.repTime,
            } : d))
          }
          closeDutyDrawer()
          showToast(isAdd ? 'Duty added successfully' : 'Duty updated successfully')
        }}
      />

      <AllotDrawer
        open={allotDuty !== null}
        duty={allotDuty ? dutyToAllotInfo(allotDuty) : null}
        onClose={closeAllotDrawer}
        onAllot={(vehicle, driver) => {
          if (allotDuty) {
            setDuties(prev => prev.map(d => d.id === allotDuty.id ? {
              ...d,
              status: 'Allotted',
              vehicleName: vehicle.modelName,
              vehicleNumber: vehicle.vehicleNumber,
              driver: driver
                ? { initials: driver.initials, name: driver.name, color: 'bg-violet-100 text-violet-700' }
                : vehicle.assignedDriver
                  ? { initials: vehicle.assignedDriver.initials, name: vehicle.assignedDriver.name, color: 'bg-violet-100 text-violet-700' }
                  : undefined,
            } : d))
          }
          closeAllotDrawer()
          showToast('Vehicle and driver allotted successfully')
        }}
      />
    </div>
  )
}
