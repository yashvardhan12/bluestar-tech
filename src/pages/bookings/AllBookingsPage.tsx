import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, Trash2, MoreHorizontal, ChevronDown,
  ChevronLeft, ChevronRight, CheckCircle, Eye, Pencil, Car,
  FileText, RotateCcw, XCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import ConfirmDeleteModal, { type DeleteCheckbox } from '../../components/ui/ConfirmDeleteModal'
import AddBookingDrawer from './AddBookingDrawer'
import AllotDrawer from './AllotDrawer'
import type { MockVehicle, MockDriver } from './AllotDrawer'
import StatusBadge from '../../components/ui/StatusBadge'
import type { BookingStatus } from '../../components/ui/StatusBadge'
import DateRangePicker from '../../components/ui/DateRangePicker'
import type { DateRange } from '../../components/ui/DateRangePicker'
import { useToast } from '../../components/ui/Toast'
import { supabase } from '../../lib/supabase'
import { syncBookingStatus, syncOnGoingStatuses } from '../../lib/bookingStatus'

// ── types ─────────────────────────────────────────────────────────────────────

type StatusFilter = 'All' | BookingStatus

interface Booking {
  id: number
  bookingRef: string
  startDate: string   // DD/MM/YYYY for display
  endDate: string
  startDateRaw: Date  // for date-range filtering
  customer: string
  passenger: string
  passengerExtra?: number
  vehicleGroup: string
  dutyType: string
  status: BookingStatus
}

// ── helpers ───────────────────────────────────────────────────────────────────

function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const [yyyy, mm, dd] = iso.split('-')
  return `${dd}/${mm}/${yyyy}`
}

const STATUS_TABS: StatusFilter[] = ['All', 'Booked', 'Confirmed', 'Allotted', 'Partially Allotted', 'On-Going', 'Completed', 'Billed', 'Cancelled']
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

// ── actions menu ──────────────────────────────────────────────────────────────

interface MenuItem {
  label: string
  icon: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'danger' | 'confirm'
}

function ActionsMenu({ items }: { items: (MenuItem | 'divider')[] }) {
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
    setPos({ top: rect.bottom + 4, left: rect.right - 220 })
    setOpen(v => !v)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <MoreHorizontal className="size-5" strokeWidth={1.75} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[9999] w-[220px] bg-white rounded-lg border border-gray-200 shadow-[0px_12px_16px_-4px_rgba(16,24,40,0.08),0px_4px_6px_-2px_rgba(16,24,40,0.03)] py-1"
        >
          {items.map((item, i) =>
            item === 'divider'
              ? <div key={i} className="my-1 border-t border-gray-100" />
              : (
                <div key={i} className="px-1.5 py-px">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); item.onClick(); setOpen(false) }}
                    className={clsx(
                      'w-full flex items-center gap-2 px-2.5 py-2.5 rounded-md text-sm font-medium text-left transition-colors cursor-pointer',
                      item.variant === 'danger'  && 'text-red-500 hover:bg-red-50',
                      item.variant === 'confirm' && 'text-green-700 bg-green-50 hover:bg-green-100',
                      (!item.variant || item.variant === 'default') && 'text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    <span className="size-4 shrink-0">{item.icon}</span>
                    {item.label}
                  </button>
                </div>
              )
          )}
        </div>,
        document.body
      )}
    </>
  )
}

function getBookingActions(
  booking: Booking,
  handlers: {
    onView: () => void
    onEdit: () => void
    onConfirm: () => void
    onAllotAll: () => void
    onCancel: () => void
    onRestore: () => void
    onDelete: () => void
    onViewDuties: () => void
    onGenerateInvoice: () => void
  },
): (MenuItem | 'divider')[] {
  const s = booking.status

  if (s === 'Booked') return [
    { label: 'Confirm booking', icon: <CheckCircle className="size-4" strokeWidth={1.75} />, onClick: handlers.onConfirm, variant: 'confirm' },
    'divider',
    { label: 'View booking',   icon: <Eye    className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit booking',   icon: <Pencil className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
    'divider',
    { label: 'View duty(s)',   icon: <Car    className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewDuties },
    'divider',
    { label: 'Delete Booking', icon: <Trash2 className="size-4" strokeWidth={1.75} />, onClick: handlers.onDelete, variant: 'danger' },
  ]

  if (s === 'Confirmed') return [
    { label: 'View booking',     icon: <Eye      className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit booking',     icon: <Pencil   className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
    'divider',
    { label: 'View duty(s)',     icon: <Car      className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewDuties },
    { label: 'Allot all duties', icon: <CheckCircle className="size-4" strokeWidth={1.75} />, onClick: handlers.onAllotAll },
    { label: 'Generate invoice', icon: <FileText className="size-4" strokeWidth={1.75} />, onClick: handlers.onGenerateInvoice },
    'divider',
    { label: 'Delete Booking',   icon: <Trash2   className="size-4" strokeWidth={1.75} />, onClick: handlers.onDelete, variant: 'danger' },
  ]

  if (s === 'Allotted' || s === 'Partially Allotted') return [
    { label: 'View booking',      icon: <Eye        className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit booking',      icon: <Pencil     className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
    'divider',
    { label: 'View duty(s)',      icon: <Car        className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewDuties },
    { label: 'Re-allot all duties', icon: <CheckCircle className="size-4" strokeWidth={1.75} />, onClick: handlers.onAllotAll },
    'divider',
    { label: 'Cancel booking',    icon: <XCircle    className="size-4" strokeWidth={1.75} />, onClick: handlers.onCancel, variant: 'danger' },
    { label: 'Delete booking',    icon: <Trash2     className="size-4" strokeWidth={1.75} />, onClick: handlers.onDelete, variant: 'danger' },
  ]

  if (s === 'On-Going') return [
    { label: 'View booking',   icon: <Eye    className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    'divider',
    { label: 'View duty(s)',   icon: <Car    className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewDuties },
  ]

  if (s === 'Completed') return [
    { label: 'View booking',     icon: <Eye      className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'View duty(s)',     icon: <Car      className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewDuties },
    'divider',
    { label: 'Generate Invoice', icon: <FileText className="size-4" strokeWidth={1.75} />, onClick: handlers.onGenerateInvoice, variant: 'confirm' },
  ]

  if (s === 'Billed') return [
    { label: 'View booking', icon: <Eye      className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'View duty(s)', icon: <Car      className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewDuties },
    { label: 'View Invoice', icon: <FileText className="size-4" strokeWidth={1.75} />, onClick: handlers.onGenerateInvoice },
  ]

  if (s === 'Cancelled') return [
    { label: 'View booking',    icon: <Eye       className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Restore booking', icon: <RotateCcw className="size-4" strokeWidth={1.75} />, onClick: handlers.onRestore },
    'divider',
    { label: 'Delete Booking',  icon: <Trash2    className="size-4" strokeWidth={1.75} />, onClick: handlers.onDelete, variant: 'danger' },
  ]

  return [{ label: 'View booking', icon: <Eye className="size-4" strokeWidth={1.75} />, onClick: handlers.onView }]
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function AllBookingsPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [rows, setRows]               = useState<Booking[]>([])
  const [loading, setLoading]         = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState<Set<number>>(new Set())
  const [page, setPage]               = useState(1)
  const [dateRange, setDateRange]     = useState<DateRange | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Booking | null>(null)
  const [deleteSms, setDeleteSms] = useState(false)
  const [bookingDrawer, setBookingDrawer] = useState<{ open: boolean; mode: 'add' | 'edit' | 'view'; bookingId?: number }>({ open: false, mode: 'add' })
  const [allotDrawer, setAllotDrawer] = useState<{ open: boolean; bookingId?: number; vehicleGroup?: string; dutyCount?: number }>({ open: false })

  function openAddDrawer() { setBookingDrawer({ open: true, mode: 'add' }) }
  function openViewDrawer(id: number) { setBookingDrawer({ open: true, mode: 'view', bookingId: id }) }
  function openEditDrawer(id: number) { setBookingDrawer({ open: true, mode: 'edit', bookingId: id }) }
  function closeDrawer() { setBookingDrawer(d => ({ ...d, open: false })) }

  async function openAllotAllDuties(booking: Booking) {
    const { data, error } = await supabase
      .from('duties')
      .select('id')
      .eq('booking_id', booking.id)
    if (error) { showToast('Failed to load duties', 'error'); return }
    setAllotDrawer({ open: true, bookingId: booking.id, vehicleGroup: booking.vehicleGroup, dutyCount: data?.length ?? 0 })
  }

  async function handleBulkAllot(vehicle: MockVehicle, driver: MockDriver | null) {
    if (!allotDrawer.bookingId) return
    const { error } = await supabase
      .from('duties')
      .update({ vehicle_id: vehicle.id, driver_id: driver?.id ?? null, status: 'Allotted' })
      .eq('booking_id', allotDrawer.bookingId)
    if (error) { showToast('Failed to allot duties', 'error'); return }
    const newStatus = await syncBookingStatus(allotDrawer.bookingId)
    if (newStatus) setRows(prev => prev.map(r => r.id === allotDrawer.bookingId ? { ...r, status: newStatus } : r))
    showToast(`All duties allotted to ${vehicle.modelName}${driver ? ` · ${driver.name}` : ''}`)
  }

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id, booking_ref, status, customer_name, duty_type, vehicle_group,
        start_date, end_date,
        booking_passengers ( name, sort_order )
      `)
      .order('created_at', { ascending: false })

    if (error) { console.error(error); setLoading(false); return }

    const mapped: Booking[] = (data ?? []).map((r: any) => {
      const sorted = [...(r.booking_passengers ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
      const firstPassenger = sorted[0]?.name ?? '—'
      const extraCount = sorted.length > 1 ? sorted.length - 1 : undefined
      return {
        id:             r.id,
        bookingRef:     r.booking_ref,
        startDate:      isoToDisplay(r.start_date),
        endDate:        isoToDisplay(r.end_date),
        startDateRaw:   new Date(r.start_date),
        customer:       r.customer_name,
        passenger:      firstPassenger,
        passengerExtra: extraCount,
        vehicleGroup:   r.vehicle_group ?? '—',
        dutyType:       r.duty_type ?? '—',
        status:         r.status as BookingStatus,
      }
    })
    setRows(mapped)
    setLoading(false)

    // Batch On-Going transition for any active (non-protected) bookings
    const transitionCandidates = mapped
      .filter(b => b.status !== 'Billed' && b.status !== 'Cancelled' && b.status !== 'On-Going' && b.status !== 'Completed')
      .map(b => b.id)
    if (transitionCandidates.length > 0) {
      const flipped = await syncOnGoingStatuses(transitionCandidates)
      if (flipped.length > 0) {
        setRows(prev => prev.map(r => flipped.includes(r.id) ? { ...r, status: 'On-Going' } : r))
      }
    }
  }, [])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  // filtering
  const filtered = rows.filter(b => {
    const matchesStatus = statusFilter === 'All' || b.status === statusFilter
    const q = search.toLowerCase()
    const matchesSearch =
      !q ||
      b.customer.toLowerCase().includes(q) ||
      b.passenger.toLowerCase().includes(q) ||
      b.dutyType.toLowerCase().includes(q) ||
      b.bookingRef.toLowerCase().includes(q)
    const matchesDateRange = !dateRange ||
      (b.startDateRaw >= dateRange.start && b.startDateRaw <= dateRange.end)
    return matchesStatus && matchesSearch && matchesDateRange
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

  async function handleDelete() {
    if (!deleteTarget) return
    const { error } = await supabase.from('bookings').delete().eq('id', deleteTarget.id)
    if (error) { showToast('Failed to delete booking', 'error'); return }
    setSelected(prev => { const next = new Set(prev); next.delete(deleteTarget.id); return next })
    setRows(prev => prev.filter(r => r.id !== deleteTarget.id))
    setDeleteTarget(null)
    showToast('Booking deleted successfully')
  }

  async function updateBookingStatus(id: number, status: BookingStatus) {
    const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
    if (error) { showToast('Failed to update booking', 'error'); return }
    setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r))
  }

  async function handleConfirmBooking(id: number) {
    const { error } = await supabase.from('bookings').update({ status: 'Confirmed' }).eq('id', id)
    if (error) { showToast('Failed to confirm booking', 'error'); return }
    // Set all non-cancelled, non-completed duties to Confirmed
    await supabase
      .from('duties')
      .update({ status: 'Confirmed' })
      .eq('booking_id', id)
      .not('status', 'in', '("Cancelled","Completed")')
    setRows(prev => prev.map(r => r.id === id ? { ...r, status: 'Confirmed' } : r))
    showToast('Booking confirmed')
  }

  return (
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* ── Header ── */}
      <div className="border-b border-gray-200 pb-5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-[30px] font-semibold leading-[38px] text-gray-900">Bookings</h1>
          <p className="text-base font-normal text-gray-500 leading-6">Create and manage your bookings from here</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/bookings/duties')}
            className="px-4 py-2.5 border border-violet-300 rounded-lg bg-white text-sm font-semibold text-violet-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-violet-50 transition-colors cursor-pointer"
          >
            All Duties
          </button>
          <button
            onClick={openAddDrawer}
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
          <DateRangePicker value={dateRange} onChange={r => { setDateRange(r); setPage(1) }} />
          {dateRange && (
            <button
              onClick={() => { setDateRange(null); setPage(1) }}
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
            {loading && (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && pageRows.map(row => (
              <tr
                key={row.id}
                onClick={() => navigate(`/bookings/${row.id}`)}
                className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer group"
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
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-xs font-medium text-gray-500">
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
                <td className="h-[72px] px-6 py-4 text-sm text-gray-500">—</td>

                {/* Status */}
                <td className="h-[72px] px-6 py-4">
                  <StatusBadge status={row.status} />
                </td>

                {/* Actions */}
                <td className="h-[72px] p-4" onClick={e => e.stopPropagation()}>
                  <ActionsMenu
                    items={getBookingActions(row, {
                      onView:            () => openViewDrawer(row.id),
                      onEdit:            () => openEditDrawer(row.id),
                      onConfirm:         () => handleConfirmBooking(row.id),
                      onAllotAll:        () => openAllotAllDuties(row),
                      onCancel:          () => updateBookingStatus(row.id, 'Cancelled'),
                      onRestore:         () => updateBookingStatus(row.id, 'Booked'),
                      onDelete:          () => { setDeleteTarget(row); setDeleteSms(false) },
                      onViewDuties:      () => navigate(`/bookings/${row.id}`),
                      onGenerateInvoice: () => navigate(`/bookings/${row.id}`),
                    })}
                  />
                </td>
              </tr>
            ))}

            {!loading && pageRows.length === 0 && (
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

      {/* Booking drawer — add / edit / view */}
      <AddBookingDrawer
        open={bookingDrawer.open}
        mode={bookingDrawer.mode}
        bookingId={bookingDrawer.bookingId}
        onClose={closeDrawer}
        onCreated={() => {
          fetchBookings()
          showToast(bookingDrawer.mode === 'edit' ? 'Booking updated successfully' : 'Booking created successfully')
        }}
      />

      {/* Bulk allot drawer */}
      <AllotDrawer
        open={allotDrawer.open}
        duty={allotDrawer.vehicleGroup ? { id: 0, date: '', repTime: '', dutyType: '', vehicleGroup: allotDrawer.vehicleGroup } : null}
        bulkMode
        bulkDutyCount={allotDrawer.dutyCount}
        onClose={() => setAllotDrawer(d => ({ ...d, open: false }))}
        onAllot={async (vehicle, driver) => {
          await handleBulkAllot(vehicle, driver)
          setAllotDrawer(d => ({ ...d, open: false }))
        }}
      />

      {/* Delete confirmation */}
      <ConfirmDeleteModal
        open={deleteTarget !== null}
        title={deleteTarget ? `Delete Booking ${deleteTarget.bookingRef}` : 'Delete Booking'}
        description="All duties, duty slips and invoices associated with this booking will be deleted as well. This is an irreversible operation."
        checkboxes={[
          { label: 'Send a cancellation SMS to the customer and driver (if one has been allotted)', checked: deleteSms, onChange: setDeleteSms },
        ] satisfies DeleteCheckbox[]}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
