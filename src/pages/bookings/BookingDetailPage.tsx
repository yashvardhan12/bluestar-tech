import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  ArrowLeft, Plus, Pencil, MoreHorizontal, Search,
  ChevronLeft, ChevronRight, ChevronDown, Eye, Truck, UserMinus,
  Trash2, RotateCcw, CheckCircle, XCircle, RefreshCw, UserX,
  Send, FileText, Printer, ArrowLeftRight, Car, FileX2,
} from 'lucide-react'
import { clsx } from 'clsx'
import StatusBadge from '../../components/ui/StatusBadge'
import type { BookingStatus } from '../../components/ui/StatusBadge'
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal'
import ClearAllotmentModal from '../../components/ui/ClearAllotmentModal'
import DateRangePicker from '../../components/ui/DateRangePicker'
import type { DateRange } from '../../components/ui/DateRangePicker'
import DutyDrawer from './DutyDrawer'
import type { DutyDrawerMode } from './DutyDrawer'
import AllotDrawer from './AllotDrawer'
import type { AllotDutyInfo } from './AllotDrawer'
import { useToast } from '../../components/ui/Toast'
import { supabase } from '../../lib/supabase'
import { syncBookingStatus } from '../../lib/bookingStatus'

// ── types ─────────────────────────────────────────────────────────────────────

type DutyStatus = 'Booked' | 'Confirmed' | 'Allotted' | 'On-Going' | 'Completed' | 'Billed' | 'Cancelled'
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

const DUTY_TABS: DutyFilter[] = ['All', 'Upcoming', 'Booked', 'Confirmed', 'Allotted', 'On-Going', 'Completed', 'Billed', 'Cancelled']
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

  if (s === 'Booked' || s === 'Confirmed') return [
    { label: 'View duty',               icon: <Eye        className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit duty',               icon: <Pencil     className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
    'divider',
    { label: 'Allot vehicle and driver',icon: <Truck      className="size-4" strokeWidth={1.75} />, onClick: handlers.onAllot },
    { label: 'Print duty slip',         icon: <Printer    className="size-4" strokeWidth={1.75} />, onClick: handlers.onPrintSlip },
    'divider',
    { label: 'Unconfirm Duty',          icon: <RotateCcw  className="size-4" strokeWidth={1.75} />, onClick: handlers.onUnconfirm },
    { label: 'Cancel Duty',             icon: <XCircle    className="size-4" strokeWidth={1.75} />, onClick: handlers.onCancel, variant: 'danger' },
  ]

  if (s === 'Allotted') return [
    { label: 'View duty',                   icon: <Eye            className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit duty',                   icon: <Pencil         className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
    'divider',
    { label: 'Re-allot vehicle and driver', icon: <Car            className="size-4" strokeWidth={1.75} />, onClick: handlers.onReAllot },
    { label: 'Change Driver',               icon: <ArrowLeftRight className="size-4" strokeWidth={1.75} />, onClick: handlers.onChangeDriver },
    { label: 'Send information to driver',  icon: <Send           className="size-4" strokeWidth={1.75} />, onClick: handlers.onSendToDriver },
    { label: 'Print Duty Slip',             icon: <Printer        className="size-4" strokeWidth={1.75} />, onClick: handlers.onPrintSlip },
    'divider',
    { label: 'Clear allotment',             icon: <FileX2         className="size-4" strokeWidth={1.75} />, onClick: handlers.onClearAllotment },
    { label: 'Cancel Duty',                 icon: <XCircle        className="size-4" strokeWidth={1.75} />, onClick: handlers.onCancel, variant: 'danger' },
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
  const location = useLocation()
  const { showToast } = useToast()

  const [duties, setDuties]             = useState<Duty[]>([])
  const [loading, setLoading]           = useState(true)
  const [bookingInfo, setBookingInfo]   = useState<{ customer: string; passenger: string; passengerExtra?: number } | null>(null)
  const [statusFilter, setStatusFilter] = useState<DutyFilter>('All')
  const [search, setSearch]             = useState('')
  const [selected, setSelected]         = useState<Set<number>>(new Set())
  const [page, setPage]                 = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<Duty | null>(null)
  const [dateRange, setDateRange]       = useState<DateRange | null>(null)
  const [dutyDrawer, setDutyDrawer]     = useState<{ open: boolean; mode: DutyDrawerMode; duty: Duty | null }>({
    open: false, mode: 'add', duty: null,
  })

  function isoToDisplay(iso: string) {
    if (!iso) return ''
    const [yyyy, mm, dd] = iso.split('-')
    return `${dd}/${mm}/${yyyy}`
  }

  const fetchDuties = useCallback(async () => {
    if (!bookingId) return
    setLoading(true)

    const [{ data: bk }, { data: dutiesData }] = await Promise.all([
      supabase
        .from('bookings')
        .select('customer_name, booking_passengers(name, sort_order)')
        .eq('id', bookingId)
        .single(),
      supabase
        .from('duties')
        .select('id, status, start_date, end_date, duty_type, vehicle_group, reporting_time, vehicles(model_name, vehicle_number), drivers(id, name, initials)')
        .eq('booking_id', bookingId)
        .order('start_date'),
    ])

    if (bk) {
      const sorted = [...(bk.booking_passengers ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
      setBookingInfo({
        customer:       bk.customer_name,
        passenger:      sorted[0]?.name ?? '—',
        passengerExtra: sorted.length > 1 ? sorted.length - 1 : undefined,
      })
    }

    if (dutiesData) {
      setDuties(dutiesData.map((r: any) => ({
        id:            r.id,
        date:          isoToDisplay(r.start_date),
        customer:      bk?.customer_name ?? '',
        passenger:     bk ? (() => {
          const sorted = [...(bk.booking_passengers ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
          return sorted[0]?.name ?? '—'
        })() : '—',
        passengerExtra: bk && bk.booking_passengers?.length > 1 ? bk.booking_passengers.length - 1 : undefined,
        vehicleName:   r.vehicles?.model_name ?? undefined,
        vehicleNumber: r.vehicles?.vehicle_number ?? undefined,
        vehicleGroup:  r.vehicle_group ?? undefined,
        dutyType:      r.duty_type ?? '—',
        driver:        r.drivers ? { initials: r.drivers.initials, name: r.drivers.name, color: 'bg-violet-100 text-violet-700' } : undefined,
        repTime:       r.reporting_time ?? '—',
        status:        r.status as DutyStatus,
      })))
    }

    setLoading(false)
  }, [bookingId])

  useEffect(() => { fetchDuties() }, [fetchDuties])

  // Auto-open duty view drawer when navigated from availability with a dutyId
  useEffect(() => {
    const openDutyId = (location.state as { openDutyId?: number } | null)?.openDutyId
    if (!openDutyId || loading || duties.length === 0) return
    const duty = duties.find(d => d.id === openDutyId)
    if (duty) {
      setDutyDrawer({ open: true, mode: 'view', duty })
      // Clear state so re-renders don't re-open it
      window.history.replaceState({}, '')
    }
  }, [loading, duties, location.state])

  function openDutyDrawer(mode: DutyDrawerMode, duty: Duty | null = null) {
    setDutyDrawer({ open: true, mode, duty })
  }
  function closeDutyDrawer() {
    setDutyDrawer(prev => ({ ...prev, open: false }))
  }

  const [allotDuty, setAllotDuty]               = useState<Duty | null>(null)
  const [changeDriverDuty, setChangeDriverDuty] = useState<Duty | null>(null)
  const [clearAllotTarget, setClearAllotTarget] = useState<Duty | null>(null)

  function openAllotDrawer(duty: Duty) { setAllotDuty(duty) }
  function closeAllotDrawer() { setAllotDuty(null) }
  function openChangeDriverDrawer(duty: Duty) { setChangeDriverDuty(duty) }
  function closeChangeDriverDrawer() { setChangeDriverDuty(null) }

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

  /** Update a duty's status in DB, then re-sync the parent booking status. */
  async function updateDutyStatus(id: number, status: DutyStatus) {
    const { error } = await supabase.from('duties').update({ status }).eq('id', id)
    if (error) { showToast('Failed to update duty', 'error'); return }
    setDuties(prev => prev.map(d => d.id === id ? { ...d, status } : d))
    await syncBookingStatus(Number(bookingId))
  }

  /** Clear vehicle + driver from a duty, reset it to Booked, then re-sync booking. */
  async function clearDutyAllotment(id: number) {
    const { error } = await supabase
      .from('duties')
      .update({ vehicle_id: null, driver_id: null, status: 'Booked' })
      .eq('id', id)
    if (error) { showToast('Failed to clear allotment', 'error'); return }
    setDuties(prev => prev.map(d => d.id === id
      ? { ...d, status: 'Booked', vehicleName: undefined, vehicleNumber: undefined, driver: undefined }
      : d,
    ))
    await syncBookingStatus(Number(bookingId))
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const { error } = await supabase.from('duties').delete().eq('id', deleteTarget.id)
    if (error) { showToast('Failed to delete duty', 'error'); return }
    setSelected(prev => { const next = new Set(prev); next.delete(deleteTarget.id); return next })
    setDuties(prev => prev.filter(d => d.id !== deleteTarget.id))
    setDeleteTarget(null)
    showToast('Duty deleted successfully')
    await syncBookingStatus(Number(bookingId))
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
              Booking ID: {bookingId}{bookingInfo ? ` — ${bookingInfo.customer}` : ''}
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
            {loading && (
              <tr>
                <td colSpan={9} className="py-16 text-center text-sm text-gray-400">Loading…</td>
              </tr>
            )}
            {!loading && pageRows.map(row => (
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
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-xs font-medium text-gray-500">
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
                      onAllot:          () => openAllotDrawer(row),
                      onReAllot:        () => openAllotDrawer(row),
                      onChangeDriver:   () => openChangeDriverDrawer(row),
                      onSendToDriver:   () => {},
                      onClearAllotment: () => setClearAllotTarget(row),
                      onCloseDuty:      () => updateDutyStatus(row.id, 'Completed'),
                      onUnconfirm:      () => updateDutyStatus(row.id, 'Booked'),
                      onConfirm:        () => updateDutyStatus(row.id, 'Booked'),
                      onPreviewSlip:    () => {},
                      onEditSlip:       () => {},
                      onPrintSlip:      () => {},
                      onRestore:        () => updateDutyStatus(row.id, 'Booked'),
                      onCancel:         () => updateDutyStatus(row.id, 'Cancelled'),
                      onDelete:         () => setDeleteTarget(row),
                    })}
                  />
                </td>
              </tr>
            ))}

            {!loading && pageRows.length === 0 && (
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

      <ClearAllotmentModal
        open={clearAllotTarget !== null}
        vehicleName={clearAllotTarget?.vehicleName}
        vehicleNumber={clearAllotTarget?.vehicleNumber}
        driverName={clearAllotTarget?.driver?.name}
        onClose={() => setClearAllotTarget(null)}
        onConfirm={async () => {
          if (clearAllotTarget) await clearDutyAllotment(clearAllotTarget.id)
          setClearAllotTarget(null)
        }}
      />

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
        onSave={async form => {
          const isAdd = dutyDrawer.mode === 'add'
          if (isAdd) {
            const { error } = await supabase.from('duties').insert({
              booking_id:        Number(bookingId),
              start_date:        form.startDate,
              end_date:          form.endDate || form.startDate,
              duty_type:         form.dutyType || null,
              vehicle_group:     form.vehicleGroup || null,
              from_location:     form.fromLocation || null,
              to_location:       form.toLocation || null,
              reporting_address: form.reportingAddress || null,
              drop_address:      form.dropAddress || null,
              reporting_time:    form.reportingTime || null,
              est_drop_time:     form.estDropTime || null,
              garage_start_mins: form.garageStartMins ? parseInt(form.garageStartMins) : null,
              base_rate:         form.baseRate ? parseFloat(form.baseRate) : null,
              extra_km_rate:     form.extraKmRate ? parseFloat(form.extraKmRate) : null,
              extra_hour_rate:   form.extraHourRate ? parseFloat(form.extraHourRate) : null,
              bill_to:           form.billTo || null,
              operator_notes:    form.operatorNotes || null,
              driver_notes:      form.driverNotes || null,
              status:            'Booked',
            })
            if (error) { showToast('Failed to add duty', 'error'); return }
            await syncBookingStatus(Number(bookingId))
            await fetchDuties()
          } else if (dutyDrawer.duty) {
            const { error } = await supabase.from('duties').update({
              start_date:        form.startDate || undefined,
              end_date:          form.endDate || undefined,
              duty_type:         form.dutyType || null,
              vehicle_group:     form.vehicleGroup || null,
              reporting_time:    form.reportingTime || null,
              reporting_address: form.reportingAddress || null,
              drop_address:      form.dropAddress || null,
            }).eq('id', dutyDrawer.duty.id)
            if (error) { showToast('Failed to update duty', 'error'); return }
            await syncBookingStatus(Number(bookingId))
            await fetchDuties()
          }
          closeDutyDrawer()
          showToast(isAdd ? 'Duty added successfully' : 'Duty updated successfully')
        }}
      />

      <AllotDrawer
        open={allotDuty !== null}
        duty={allotDuty ? dutyToAllotInfo(allotDuty) : null}
        onClose={closeAllotDrawer}
        onAllot={async (vehicle, driver) => {
          if (allotDuty) {
            const { error } = await supabase.from('duties').update({
              status:     'Allotted',
              vehicle_id: vehicle.id,
              driver_id:  driver?.id ?? null,
            }).eq('id', allotDuty.id)
            if (error) { showToast('Failed to allot duty', 'error'); return }
            await syncBookingStatus(Number(bookingId))
            await fetchDuties()
          }
          closeAllotDrawer()
          showToast('Vehicle and driver allotted successfully')
        }}
      />

      {/* Change driver — driver-only mode, keeps existing vehicle */}
      <AllotDrawer
        open={changeDriverDuty !== null}
        duty={changeDriverDuty ? dutyToAllotInfo(changeDriverDuty) : null}
        driverOnlyMode
        currentVehicle={changeDriverDuty ? {
          id: 0,
          modelName: changeDriverDuty.vehicleName ?? '',
          vehicleNumber: changeDriverDuty.vehicleNumber ?? '',
          vehicleGroup: changeDriverDuty.vehicleGroup ?? '',
          assignedDriver: null,
        } : undefined}
        onClose={closeChangeDriverDrawer}
        onAllot={async (vehicle, driver) => {
          if (changeDriverDuty) {
            const { error } = await supabase.from('duties').update({
              driver_id: driver?.id ?? null,
            }).eq('id', changeDriverDuty.id)
            if (error) { showToast('Failed to change driver', 'error'); return }
            await fetchDuties()
          }
          closeChangeDriverDrawer()
          showToast('Driver updated successfully')
        }}
      />
    </div>
  )
}
