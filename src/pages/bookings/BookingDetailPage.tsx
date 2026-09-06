import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  ArrowLeft, Plus, Pencil, MoreHorizontal, Search,
  ChevronLeft, ChevronRight, ChevronDown, Eye, Truck,
  RotateCcw, XCircle,
  Send, FileText, Printer, ArrowLeftRight, Car, FileX2, CheckCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import StatusBadge from '../../components/ui/StatusBadge'
import type { BookingStatus } from '../../components/ui/StatusBadge'
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal'
import AddBookingDrawer from './AddBookingDrawer'
import { getBookingActions } from './bookingActions'
import type { MenuItem } from './bookingActions'
import ClearAllotmentModal from '../../components/ui/ClearAllotmentModal'
import DateRangePicker from '../../components/ui/DateRangePicker'
import type { DateRange } from '../../components/ui/DateRangePicker'
import DutyDrawer from './DutyDrawer'
import type { DutyDrawerMode } from './DutyDrawer'
import AllotDrawer from './AllotDrawer'
import type { AllotDutyInfo } from './AllotDrawer'
import DutySlipDrawer from './DutySlipDrawer'
import { useToast } from '../../components/ui/Toast'
import { supabase } from '../../lib/supabase'
import { useMenuFlip } from '../../lib/useMenuFlip'
import { syncBookingStatus } from '../../lib/bookingStatus'
import { isCloseable } from '../../lib/dutyClose'
import CloseDutyModal from '../../components/ui/CloseDutyModal'

// ── types ─────────────────────────────────────────────────────────────────────

type DutyStatus = 'Booked' | 'Confirmed' | 'Allotted' | 'On-Going' | 'Needs closing' | 'Completed' | 'Billed' | 'Cancelled'
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
  /** FR-59 gate — the action follows this column, never the status. */
  closedAt: string | null
}

const DUTY_TABS: DutyFilter[] = ['All', 'Upcoming', 'Booked', 'Confirmed', 'Allotted', 'On-Going', 'Needs closing', 'Completed', 'Billed', 'Cancelled']
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
    setPos({ top: rect.bottom + 4, left: rect.right - 240 })
    setOpen(v => !v)
  }

  useMenuFlip(open, btnRef, menuRef, top => setPos(p => ({ ...p, top })))

  // A status with no branch in the actions builder used to render a button
  // that opened an empty 240px box. A dead affordance is worse than none.
  if (items.length === 0) return null

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
          className="fixed z-[9999] w-[240px] bg-white rounded-lg border border-gray-200 shadow-lg py-1"
        >
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
                    item.variant === 'confirm' && 'text-green-700 bg-green-50 hover:bg-green-100',
                    (!item.variant || item.variant === 'default') && 'text-gray-700 hover:bg-gray-50',
                  )}
                >
                  <span className="size-4 shrink-0">{item.icon}</span>
                  {item.label}
                </button>
              )
          )}
        </div>,
        document.body,
      )}
    </>
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

  // FR-59. Same predicate the modal uses, so the menu can never offer a close
  // that would then be refused.
  const close: (MenuItem | 'divider')[] = isCloseable(duty.status, duty.closedAt)
    ? [{ label: 'Close duty', icon: <CheckCircle className="size-4" strokeWidth={1.75} />, onClick: handlers.onCloseDuty }, 'divider']
    : []

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
    ...close,
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

  // A live duty. No 'View booking' — this page is the booking. Print and
  // 'Send to driver' are still no-op stubs, so they are left out rather than
  // added as more buttons that do nothing. Close duty lands here next.
  if (s === 'On-Going') return [
    ...close,
    { label: 'View duty',     icon: <Eye            className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit duty',     icon: <Pencil         className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
    'divider',
    { label: 'Change Driver', icon: <ArrowLeftRight className="size-4" strokeWidth={1.75} />, onClick: handlers.onChangeDriver },
    'divider',
    { label: 'Cancel Duty',   icon: <XCircle        className="size-4" strokeWidth={1.75} />, onClick: handlers.onCancel, variant: 'danger' },
  ]

  // Ran, never closed. No slip actions: there is no slip to preview or print
  // until the close writes one.
  if (s === 'Needs closing') return [
    ...close,
    { label: 'View duty', icon: <Eye    className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit duty', icon: <Pencil className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
  ]

  if (s === 'Completed' || s === 'Billed') return [
    ...close,
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
  const [bookingInfo, setBookingInfo]   = useState<{
    customer: string; passenger: string; passengerExtra?: number
    /** Derived by bookings_status, so it agrees with the list. */
    status: BookingStatus; startDate: string | null; endDate: string | null
  } | null>(null)
  const [editBooking, setEditBooking]   = useState(false)
  const [deleteBooking, setDeleteBooking] = useState(false)
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
      // bookings_status, not bookings: the header badge and the actions menu
      // must read the same derived status the list shows, or this page offers
      // Generate Invoice on a booking the list calls Needs closing.
      supabase
        .from('bookings_status')
        .select('status:effective_status, customer_name, start_date, end_date, booking_passengers(name, sort_order)')
        .eq('id', bookingId)
        .single(),
      // Reads come from duties_status so this page and All Duties can never
      // disagree about the same duty — it used to show the raw column, which
      // says Completed on a duty that was never closed. Writes below still go
      // to the `duties` table.
      supabase
        .from('duties_status')
        .select('id, status:effective_status, closed_at, start_date, end_date, duty_type, vehicle_group, reporting_time, vehicles(model_name, vehicle_number), drivers(id, name, initials)')
        .eq('booking_id', bookingId)
        .order('start_date'),
    ])

    if (bk) {
      const sorted = [...(bk.booking_passengers ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
      setBookingInfo({
        customer:       bk.customer_name,
        passenger:      sorted[0]?.name ?? '—',
        passengerExtra: sorted.length > 1 ? sorted.length - 1 : undefined,
        status:         bk.status as BookingStatus,
        startDate:      bk.start_date,
        endDate:        bk.end_date,
      })
    }

    if (dutiesData) {
      setDuties(dutiesData.map((r: any) => ({
        id:            r.id,
        closedAt:      r.closed_at,
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

  // ── booking-level actions, behind the ⋯ menu ───────────────────────────────
  // These write `bookings.status` directly, exactly as AllBookingsPage does.
  // bookings_status only treats Billed and Cancelled as terminal, so everything
  // else is re-derived on the next read and cannot be left stale by this.
  async function setBookingStatus(status: BookingStatus) {
    const { error } = await supabase.from('bookings').update({ status }).eq('id', bookingId)
    if (error) { showToast('Failed to update booking'); return }
    await fetchDuties()
    showToast(status === 'Cancelled' ? 'Booking cancelled' : 'Booking updated')
  }

  async function confirmBooking() {
    const { error } = await supabase.from('bookings').update({ status: 'Confirmed' }).eq('id', bookingId)
    if (error) { showToast('Failed to confirm booking'); return }
    // Same rule as the list: a duty already Completed or Cancelled is not
    // dragged back to Confirmed by confirming its booking.
    await supabase
      .from('duties')
      .update({ status: 'Confirmed' })
      .eq('booking_id', bookingId)
      .not('status', 'in', '("Cancelled","Completed")')
    await fetchDuties()
    showToast('Booking confirmed')
  }

  async function deleteThisBooking() {
    const { error } = await supabase.from('bookings').delete().eq('id', bookingId)
    if (error) { showToast('Failed to delete booking'); return }
    // The page we are standing on no longer exists.
    navigate('/bookings/all')
  }

  /** Only closed duties have a slip worth printing; the pack route skips the
   *  rest, and this count decides whether the menu offers it at all. */
  const closedDuties = duties.filter(d => d.closedAt != null && d.status !== 'Cancelled').length

  function openDutyDrawer(mode: DutyDrawerMode, duty: Duty | null = null) {
    setDutyDrawer({ open: true, mode, duty })
  }
  function closeDutyDrawer() {
    setDutyDrawer(prev => ({ ...prev, open: false }))
  }

  const [slipDuty, setSlipDuty]                 = useState<{ id: number; mode: 'view' | 'edit' } | null>(null)
  const [closeTarget, setCloseTarget]            = useState<Duty | null>(null)
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

  // ── bulk actions on the selection ──────────────────────────────────────────
  // Deliberately not bulk delete. Duties on a booking are the thing being sold;
  // the useful bulk verbs are the ones that move them forward, and every one of
  // them is reversible from the row menu.

  const selectedIds = [...selected]
  /** Only a closed duty has a slip. The pack route filters again and reports
   *  what it dropped, so the count here is a label, not a gate. */
  const selectedClosed = duties.filter(d => selected.has(d.id) && d.closedAt != null).length

  function printSelectedSlips() {
    window.open(`/bookings/${bookingId}/slips?duties=${selectedIds.join(',')}`, '_blank', 'noopener')
  }

  async function confirmSelected() {
    // Same guard the booking-level confirm uses: a duty already Completed or
    // Cancelled is not dragged backwards by a bulk action.
    const { error } = await supabase
      .from('duties')
      .update({ status: 'Confirmed' })
      .in('id', selectedIds)
      .not('status', 'in', '("Cancelled","Completed")')
    if (error) { showToast('Failed to confirm duties'); return }
    setSelected(new Set())
    await fetchDuties()
    showToast(`${selectedIds.length} ${selectedIds.length === 1 ? 'duty' : 'duties'} confirmed`)
  }

  /** Update a duty's status in DB, then re-sync the parent booking status. */
  async function updateDutyStatus(id: number, status: DutyStatus) {
    const { error } = await supabase.from('duties').update({ status }).eq('id', id)
    if (error) { showToast('Failed to update duty'); return }
    setDuties(prev => prev.map(d => d.id === id ? { ...d, status } : d))
    await syncBookingStatus(Number(bookingId))
  }

  /** Clear vehicle + driver from a duty, reset it to Booked, then re-sync booking. */
  async function clearDutyAllotment(id: number) {
    const { error } = await supabase
      .from('duties')
      .update({ vehicle_id: null, driver_id: null, status: 'Booked' })
      .eq('id', id)
    if (error) { showToast('Failed to clear allotment'); return }
    setDuties(prev => prev.map(d => d.id === id
      ? { ...d, status: 'Booked', vehicleName: undefined, vehicleNumber: undefined, driver: undefined }
      : d,
    ))
    await syncBookingStatus(Number(bookingId))
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const { error } = await supabase.from('duties').delete().eq('id', deleteTarget.id)
    if (error) { showToast('Failed to delete duty'); return }
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
              {bookingInfo?.startDate
                ? `${isoToDisplay(bookingInfo.startDate)} to ${isoToDisplay(bookingInfo.endDate ?? bookingInfo.startDate)}`
                : '—'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-1">
            <button
              onClick={() => openDutyDrawer('add')}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-violet-300 rounded-lg bg-white text-sm font-semibold text-violet-700 shadow-xs hover:bg-violet-50 transition-colors cursor-pointer"
            >
              <Plus className="size-4" strokeWidth={2.5} />
              Add Duty
            </button>
            <button
              onClick={() => setEditBooking(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-violet-300 rounded-lg bg-white text-sm font-semibold text-violet-700 shadow-xs hover:bg-violet-50 transition-colors cursor-pointer"
            >
              <Pencil className="size-4" strokeWidth={1.75} />
              Edit
            </button>
            {bookingInfo && (
              <ActionsMenu
                items={getBookingActions(
                  { status: bookingInfo.status },
                  {
                    onView:            () => setEditBooking(true),
                    onEdit:            () => setEditBooking(true),
                    onConfirm:         () => void confirmBooking(),
                    onAllotAll:        () => showToast('Allot each duty from its row menu'),
                    onCancel:          () => void setBookingStatus('Cancelled'),
                    onRestore:         () => void setBookingStatus('Booked'),
                    onDelete:          () => setDeleteBooking(true),
                    onViewDuties:      () => {},
                    // No booking preselect exists on the create-invoice route
                    // yet; the list's own item lands on this page, so this is
                    // still a step forward rather than a circle.
                    onGenerateInvoice: () => navigate('/billing/invoices/create'),
                    onPrintSlips:      () => window.open(`/bookings/${bookingId}/slips`, '_blank', 'noopener'),
                  },
                  { onDetailPage: true, closedDuties },
                )}
              />
            )}
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
            className="w-full pl-[38px] pr-3.5 py-2.5 border border-gray-300 rounded-lg shadow-xs text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
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

      {/* ── Bulk actions ──
          Shown only with a selection, so the checkboxes lead somewhere. Mirrors
          the bar the database pages use, minus the bulk delete: see above. */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <p className="text-sm font-semibold text-violet-900">
            {selected.size} {selected.size === 1 ? 'duty' : 'duties'} selected
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => void confirmSelected()}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-xs transition-colors hover:bg-gray-50 cursor-pointer"
            >
              <CheckCircle className="size-4" strokeWidth={1.75} />
              Confirm
            </button>
            <button
              onClick={printSelectedSlips}
              disabled={selectedClosed === 0}
              title={selectedClosed === 0 ? 'None of the selected duties has been closed yet' : undefined}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Printer className="size-4" strokeWidth={1.75} />
              Print {selectedClosed > 0 ? selectedClosed : ''} duty slip{selectedClosed === 1 ? '' : 's'}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-700 cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
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
                      onCloseDuty:      () => setCloseTarget(row),
                      onUnconfirm:      () => updateDutyStatus(row.id, 'Booked'),
                      onConfirm:        () => updateDutyStatus(row.id, 'Booked'),
                      onPreviewSlip:    () => setSlipDuty({ id: row.id, mode: 'view' }),
                      onEditSlip:       () => setSlipDuty({ id: row.id, mode: 'edit' }),
                      onPrintSlip:      () => window.open(`/duties/${row.id}/slip`, '_blank', 'noopener'),
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
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white shadow-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
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
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white shadow-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
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
        dutyId={dutyDrawer.duty?.id}
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
            if (error) { showToast('Failed to add duty'); return }
            await syncBookingStatus(Number(bookingId))
            await fetchDuties()
          } else if (dutyDrawer.duty) {
            const { error } = await supabase.from('duties').update({
              duty_type:         form.dutyType || null,
              vehicle_group:     form.vehicleGroup || null,
              from_location:     form.fromLocation || null,
              to_location:       form.toLocation || null,
              reporting_address: form.reportingAddress || null,
              drop_address:      form.dropAddress || null,
              start_date:        form.startDate || undefined,
              end_date:          form.endDate || form.startDate || undefined,
              reporting_time:    form.reportingTime || null,
              est_drop_time:     form.estDropTime || null,
              garage_start_mins: form.garageStartMins ? parseInt(form.garageStartMins) : null,
              base_rate:         form.baseRate ? parseFloat(form.baseRate) : null,
              extra_km_rate:     form.extraKmRate ? parseFloat(form.extraKmRate) : null,
              extra_hour_rate:   form.extraHourRate ? parseFloat(form.extraHourRate) : null,
              bill_to:           form.billTo || null,
              operator_notes:    form.operatorNotes || null,
              driver_notes:      form.driverNotes || null,
            }).eq('id', dutyDrawer.duty.id)
            if (error) { showToast('Failed to update duty'); return }
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
        bookingId={Number(bookingId)}
        onClose={closeAllotDrawer}
        onAllot={async (vehicle, driver) => {
          if (allotDuty) {
            const { error } = await supabase.from('duties').update({
              status:     'Allotted',
              vehicle_id: vehicle.id,
              driver_id:  driver?.id ?? null,
            }).eq('id', allotDuty.id)
            if (error) { showToast('Failed to allot duty'); return }
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
        onAllot={async (_vehicle, driver) => {
          if (changeDriverDuty) {
            const { error } = await supabase.from('duties').update({
              driver_id: driver?.id ?? null,
            }).eq('id', changeDriverDuty.id)
            if (error) { showToast('Failed to change driver'); return }
            await fetchDuties()
          }
          closeChangeDriverDrawer()
          showToast('Driver updated successfully')
        }}
      />

      {closeTarget && (
        <CloseDutyModal
          dutyId={closeTarget.id}
          onClose={() => setCloseTarget(null)}
          onSaved={() => { showToast('Duty closed'); void fetchDuties() }}
        />
      )}

      <AddBookingDrawer
        open={editBooking}
        mode="edit"
        bookingId={Number(bookingId)}
        onClose={() => setEditBooking(false)}
        onCreated={() => { void fetchDuties(); showToast('Booking updated successfully') }}
      />

      <ConfirmDeleteModal
        open={deleteBooking}
        title="Delete this booking?"
        description="The booking and every duty on it are removed. This cannot be undone."
        onClose={() => setDeleteBooking(false)}
        onConfirm={() => { setDeleteBooking(false); void deleteThisBooking() }}
      />

      {slipDuty && (
        <DutySlipDrawer
          dutyId={slipDuty.id}
          mode={slipDuty.mode}
          onClose={() => setSlipDuty(null)}
          onSaved={fetchDuties}
        />
      )}
    </div>
  )
}
