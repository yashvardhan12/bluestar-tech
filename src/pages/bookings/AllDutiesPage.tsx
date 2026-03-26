import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Search, ChevronDown, MoreHorizontal,
  Eye, Pencil, Car, ArrowLeftRight, Printer, FileX2, XCircle, RotateCcw,
} from 'lucide-react'
import { clsx } from 'clsx'
import StatusBadge from '../../components/ui/StatusBadge'
import type { BookingStatus } from '../../components/ui/StatusBadge'
import DutyDrawer from './DutyDrawer'
import type { DutyDrawerMode } from './DutyDrawer'
import AllotDrawer from './AllotDrawer'
import type { MockVehicle, MockDriver } from './AllotDrawer'
import AddBookingDrawer from './AddBookingDrawer'
import DateRangePicker from '../../components/ui/DateRangePicker'
import type { DateRange } from '../../components/ui/DateRangePicker'
import ClearAllotmentModal from '../../components/ui/ClearAllotmentModal'
import RestoreDutyModal from '../../components/ui/RestoreDutyModal'
import { useToast } from '../../components/ui/Toast'
import { supabase } from '../../lib/supabase'
import { syncDutyStatus, syncDutiesOnGoing, syncCompletedDuties, syncBookingStatus } from '../../lib/bookingStatus'
import type { DutyStatus } from '../../lib/bookingStatus'

// ── types ─────────────────────────────────────────────────────────────────────

type DutyFilter = 'All' | 'Upcoming' | DutyStatus

interface DutyRow {
  id: number
  bookingId: number
  bookingRef: string
  startDate: string
  endDate: string
  startDateRaw: Date
  customer: string
  passenger: string
  passengerExtra?: number
  vehicleId?: number
  vehicleName?: string
  vehicleNumber?: string
  vehicleGroup?: string
  dutyType: string
  driver?: { id: number; initials: string; name: string }
  repTime: string
  status: DutyStatus
}

// ── helpers ───────────────────────────────────────────────────────────────────

function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const [yyyy, mm, dd] = iso.split('-')
  return `${dd}/${mm}/${yyyy}`
}

const DUTY_TABS: DutyFilter[] = ['All', 'Upcoming', 'Booked', 'Confirmed', 'Allotted', 'On-Going', 'Completed']
const BATCH_SIZE = 20

// ── actions menu ──────────────────────────────────────────────────────────────

interface MenuItem { label: string; icon: React.ReactNode; onClick: () => void; variant?: 'default' | 'danger' | 'confirm' }

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
          className="fixed z-[9999] w-[240px] bg-white rounded-lg border border-gray-200 shadow-[0px_12px_16px_-4px_rgba(16,24,40,0.08),0px_4px_6px_-2px_rgba(16,24,40,0.03)] py-1"
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
        document.body,
      )}
    </>
  )
}

function getDutyActions(
  duty: DutyRow,
  handlers: {
    onView: () => void
    onEdit: () => void
    onViewBooking: () => void
    onAllot: () => void
    onChangeDriver: () => void
    onPrintSlip: () => void
    onClearAllotment: () => void
    onRestore: () => void
    onCancel: () => void
  },
): (MenuItem | 'divider')[] {
  const s = duty.status

  if (s === 'Booked' || s === 'Confirmed') return [
    { label: 'View duty',                icon: <Eye     className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit duty',                icon: <Pencil  className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
    'divider',
    { label: 'View booking',             icon: <Eye     className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewBooking },
    { label: 'Allot vehicle and driver', icon: <Car     className="size-4" strokeWidth={1.75} />, onClick: handlers.onAllot },
    { label: 'Print duty slip',          icon: <Printer className="size-4" strokeWidth={1.75} />, onClick: handlers.onPrintSlip },
    'divider',
    { label: 'Cancel Duty',              icon: <XCircle className="size-4" strokeWidth={1.75} />, onClick: handlers.onCancel, variant: 'danger' },
  ]

  if (s === 'Allotted') return [
    { label: 'View duty',                   icon: <Eye            className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit duty',                   icon: <Pencil         className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
    'divider',
    { label: 'View booking',                icon: <Eye            className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewBooking },
    { label: 'Re-allot vehicle and driver', icon: <Car            className="size-4" strokeWidth={1.75} />, onClick: handlers.onAllot },
    { label: 'Change driver',               icon: <ArrowLeftRight className="size-4" strokeWidth={1.75} />, onClick: handlers.onChangeDriver },
    { label: 'Print duty slip',             icon: <Printer        className="size-4" strokeWidth={1.75} />, onClick: handlers.onPrintSlip },
    'divider',
    { label: 'Clear allotment',             icon: <FileX2         className="size-4" strokeWidth={1.75} />, onClick: handlers.onClearAllotment },
    { label: 'Cancel Duty',                 icon: <XCircle        className="size-4" strokeWidth={1.75} />, onClick: handlers.onCancel, variant: 'danger' },
  ]

  if (s === 'On-Going') return [
    { label: 'View duty',       icon: <Eye     className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit duty',       icon: <Pencil  className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
    'divider',
    { label: 'View booking',    icon: <Eye     className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewBooking },
    { label: 'Print duty slip', icon: <Printer className="size-4" strokeWidth={1.75} />, onClick: handlers.onPrintSlip },
    'divider',
    { label: 'Cancel Duty',     icon: <XCircle className="size-4" strokeWidth={1.75} />, onClick: handlers.onCancel, variant: 'danger' },
  ]

  if (s === 'Completed') return [
    { label: 'View duty',    icon: <Eye className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    'divider',
    { label: 'View booking', icon: <Eye className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewBooking },
  ]

  if (s === 'Cancelled') return [
    { label: 'View duty',    icon: <Eye       className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    'divider',
    { label: 'View booking', icon: <Eye       className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewBooking },
    { label: 'Restore duty', icon: <RotateCcw className="size-4" strokeWidth={1.75} />, onClick: handlers.onRestore },
  ]

  return []
}

// ── driver avatar ─────────────────────────────────────────────────────────────

function Avatar({ initials }: { initials: string }) {
  return (
    <div className="size-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
      <span className="text-xs font-semibold text-violet-600">{initials}</span>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function AllDutiesPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [rows, setRows]                         = useState<DutyRow[]>([])
  const [loading, setLoading]                   = useState(true)
  const [loadingMore, setLoadingMore]           = useState(false)
  const [hasMore, setHasMore]                   = useState(true)
  const [statusFilter, setFilter]               = useState<DutyFilter>('All')
  const [searchInput, setSearchInput]           = useState('')
  const [search, setSearch]                     = useState('')
  const [dateRange, setDateRange]               = useState<DateRange | null>(null)
  const [dutyDrawer, setDutyDrawer]             = useState<{ open: boolean; mode: DutyDrawerMode; row: DutyRow | null }>({ open: false, mode: 'view', row: null })
  const [allotDuty, setAllotDuty]               = useState<DutyRow | null>(null)
  const [changeDriverDuty, setChangeDriverDuty] = useState<DutyRow | null>(null)
  const [clearAllotTarget, setClearAllotTarget] = useState<DutyRow | null>(null)
  const [restoreTarget, setRestoreTarget]       = useState<DutyRow | null>(null)
  const [viewBookingId, setViewBookingId]       = useState<number | null>(null)

  const offsetRef   = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  function buildQuery(from: number) {
    let q = supabase
      .from('duties')
      .select(`
        id, status, start_date, end_date, duty_type, vehicle_group, reporting_time,
        booking_id,
        bookings ( booking_ref, customer_name, booking_passengers ( name, sort_order ) ),
        vehicles ( id, model_name, vehicle_number ),
        drivers  ( id, name, initials )
      `)
      .neq('status', 'Cancelled')
      .order('start_date', { ascending: true })
      .range(from, from + BATCH_SIZE - 1)

    if (statusFilter === 'Upcoming') {
      q = q.in('status', ['Booked', 'Confirmed', 'Allotted'])
    } else if (statusFilter !== 'All') {
      q = q.eq('status', statusFilter)
    }

    if (dateRange) {
      q = q
        .gte('start_date', dateRange.start.toISOString().split('T')[0])
        .lte('start_date', dateRange.end.toISOString().split('T')[0])
    }

    if (search.trim()) {
      q = q.ilike('duty_type', `%${search.trim()}%`)
    }

    return q
  }

  function mapRow(r: any): DutyRow {
    const passengers = [...(r.bookings?.booking_passengers ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
    return {
      id:             r.id,
      bookingId:      r.booking_id,
      bookingRef:     r.bookings?.booking_ref ?? '—',
      startDate:      isoToDisplay(r.start_date),
      endDate:        isoToDisplay(r.end_date),
      startDateRaw:   new Date(r.start_date),
      customer:       r.bookings?.customer_name ?? '—',
      passenger:      passengers[0]?.name ?? '—',
      passengerExtra: passengers.length > 1 ? passengers.length - 1 : undefined,
      vehicleId:      r.vehicles?.id ?? undefined,
      vehicleName:    r.vehicles?.model_name ?? undefined,
      vehicleNumber:  r.vehicles?.vehicle_number ?? undefined,
      vehicleGroup:   r.vehicle_group ?? undefined,
      dutyType:       r.duty_type ?? '—',
      driver:         r.drivers ? { id: r.drivers.id, initials: r.drivers.initials, name: r.drivers.name } : undefined,
      repTime:        r.reporting_time ?? '—',
      status:         r.status as DutyStatus,
    }
  }

  const fetchInitial = useCallback(async () => {
    setLoading(true)
    offsetRef.current = 0
    const { data, error } = await buildQuery(0)
    if (error) { console.error(error); setLoading(false); return }
    const mapped = (data ?? []).map(mapRow)
    setRows(mapped)
    offsetRef.current = mapped.length
    setHasMore(mapped.length === BATCH_SIZE)
    setLoading(false)

    // Run syncs once on initial load
    const completedIds = await syncCompletedDuties()
    if (completedIds.length > 0)
      setRows(prev => prev.map(d => completedIds.includes(d.id) ? { ...d, status: 'Completed' } : d))

    const eligible = (data ?? []).filter((r: any) => !['Completed', 'Cancelled'].includes(r.status)).map((r: any) => r.id)
    const flipped = await syncDutiesOnGoing(eligible)
    if (flipped.length > 0) {
      setRows(prev => prev.map(d => flipped.includes(d.id) ? { ...d, status: 'On-Going' } : d))
      const bookingIds = [...new Set((data ?? []).filter((r: any) => flipped.includes(r.id)).map((r: any) => r.booking_id as number))]
      await Promise.all(bookingIds.map(id => syncBookingStatus(id)))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search, dateRange])

  const fetchMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const from = offsetRef.current
    const { data, error } = await buildQuery(from)
    if (error) { setLoadingMore(false); return }
    const mapped = (data ?? []).map(mapRow)
    setRows(prev => [...prev, ...mapped])
    offsetRef.current = from + mapped.length
    setHasMore(mapped.length === BATCH_SIZE)
    setLoadingMore(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, hasMore, statusFilter, search, dateRange])

  // Debounce search input → committed search (triggers re-fetch)
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => { fetchInitial() }, [fetchInitial])

  // Sentinel observer — load next batch when bottom comes into view
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) fetchMore()
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [fetchMore])

  const filtered = search.trim()
    ? rows.filter(d => {
        const q = search.toLowerCase()
        return d.dutyType.toLowerCase().includes(q) ||
          d.customer.toLowerCase().includes(q) ||
          d.passenger.toLowerCase().includes(q) ||
          d.bookingRef.toLowerCase().includes(q) ||
          (d.vehicleName ?? '').toLowerCase().includes(q) ||
          (d.driver?.name ?? '').toLowerCase().includes(q)
      })
    : rows

  function handleFilter(tab: DutyFilter) { setFilter(tab); setSearchInput(''); setSearch(''); setDateRange(null) }

  // ── mutations ───────────────────────────────────────────────────────────────

  async function handleAllot(duty: DutyRow, vehicle: MockVehicle, driver: MockDriver | null) {
    const { error } = await supabase
      .from('duties')
      .update({ vehicle_id: vehicle.id, driver_id: driver?.id ?? null })
      .eq('id', duty.id)
    if (error) { showToast('Failed to allot duty', 'error'); return }
    const newStatus = (await syncDutyStatus(duty.id)) ?? 'Allotted'
    setRows(prev => prev.map(d => d.id === duty.id ? {
      ...d,
      status:        newStatus,
      vehicleId:     vehicle.id,
      vehicleName:   vehicle.modelName,
      vehicleNumber: vehicle.vehicleNumber,
      driver:        driver ? { id: driver.id, initials: driver.initials, name: driver.name } : d.driver,
    } : d))
    await syncBookingStatus(duty.bookingId)
    showToast(`Duty allotted to ${vehicle.modelName}${driver ? ` · ${driver.name}` : ''}`)
  }

  async function handleChangeDriver(duty: DutyRow, driver: MockDriver | null) {
    const { error } = await supabase.from('duties').update({ driver_id: driver?.id ?? null }).eq('id', duty.id)
    if (error) { showToast('Failed to change driver', 'error'); return }
    setRows(prev => prev.map(d => d.id === duty.id
      ? { ...d, driver: driver ? { id: driver.id, initials: driver.initials, name: driver.name } : undefined }
      : d,
    ))
    showToast('Driver updated successfully')
  }

  async function handleClearAllotment(duty: DutyRow) {
    const { error } = await supabase
      .from('duties')
      .update({ vehicle_id: null, driver_id: null })
      .eq('id', duty.id)
    if (error) { showToast('Failed to clear allotment', 'error'); return }
    const newStatus = (await syncDutyStatus(duty.id)) ?? 'Booked'
    setRows(prev => prev.map(d => d.id === duty.id
      ? { ...d, status: newStatus, vehicleId: undefined, vehicleName: undefined, vehicleNumber: undefined, driver: undefined }
      : d,
    ))
    await syncBookingStatus(duty.bookingId)
    showToast('Allotment cleared')
  }

  async function handleRestore(duty: DutyRow) {
    const { error } = await supabase.from('duties').update({ status: 'Booked' }).eq('id', duty.id)
    if (error) { showToast('Failed to restore duty', 'error'); return }
    setRows(prev => prev.map(d => d.id === duty.id ? { ...d, status: 'Booked' } : d))
    await syncBookingStatus(duty.bookingId)
    showToast('Duty restored')
  }


  async function handleCancel(duty: DutyRow) {
    const { error } = await supabase.from('duties').update({ status: 'Cancelled' }).eq('id', duty.id)
    if (error) { showToast('Failed to cancel duty', 'error'); return }
    setRows(prev => prev.filter(d => d.id !== duty.id))
    await syncBookingStatus(duty.bookingId)
    showToast('Duty cancelled')
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* Header */}
      <div className="border-b border-gray-200 pb-5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-[30px] font-semibold leading-[38px] text-gray-900">All Duties</h1>
          <p className="text-base font-normal text-gray-500 leading-6">View and manage duties across all bookings</p>
        </div>
        <button
          onClick={() => navigate('/bookings/all')}
          className="px-4 py-2.5 border border-violet-300 rounded-lg bg-white text-sm font-semibold text-violet-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-violet-50 transition-colors cursor-pointer"
        >
          All Bookings
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-0.5 p-1 bg-gray-100 rounded-lg w-fit">
        {DUTY_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => handleFilter(tab)}
            className={clsx(
              'px-3.5 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer',
              statusFilter === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search + date filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Search by booking ref, customer, duty type or vehicle"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-full pl-[38px] pr-3.5 py-2.5 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DateRangePicker value={dateRange} onChange={r => setDateRange(r)} />
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

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] overflow-hidden flex flex-col">
        <div className="overflow-y-auto max-h-[calc(100vh-320px)]">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="bg-gray-50">
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <button className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer transition-colors">
                  Date <ChevronDown className="size-3.5 shrink-0" strokeWidth={1.75} />
                </button>
              </th>
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Booking</span>
              </th>
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Customer / Passenger</span>
              </th>
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Duty type</span>
              </th>
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Vehicle</span>
              </th>
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Driver</span>
              </th>
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Status</span>
              </th>
              <th className="h-[44px] w-[72px] border-b border-gray-200" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-gray-400">Loading…</td>
              </tr>
            )}

            {!loading && filtered.map(row => (
              <tr
                key={row.id}
                onClick={() => navigate(`/bookings/${row.bookingId}`)}
                className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <td className="h-[72px] px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">{row.startDate}</p>
                  {row.endDate !== row.startDate && (
                    <p className="text-xs text-gray-400 mt-0.5">to {row.endDate}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">{row.repTime}</p>
                </td>
                <td className="h-[72px] px-6 py-4">
                  <span className="text-sm font-medium text-violet-700">{row.bookingRef}</span>
                </td>
                <td className="h-[72px] px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">{row.customer}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs text-gray-400">{row.passenger}</span>
                    {row.passengerExtra !== undefined && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-gray-100 text-[10px] font-medium text-gray-500">
                        +{row.passengerExtra}
                      </span>
                    )}
                  </div>
                </td>
                <td className="h-[72px] px-6 py-4">
                  <p className="text-sm text-gray-700">{row.dutyType}</p>
                  {row.vehicleGroup && (
                    <p className="text-xs text-gray-400 mt-0.5">{row.vehicleGroup}</p>
                  )}
                </td>
                <td className="h-[72px] px-6 py-4">
                  {row.vehicleName ? (
                    <>
                      <p className="text-sm font-medium text-gray-900">{row.vehicleName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{row.vehicleNumber}</p>
                    </>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </td>
                <td className="h-[72px] px-6 py-4">
                  {row.driver ? (
                    <div className="flex items-center gap-2">
                      <Avatar initials={row.driver.initials} />
                      <span className="text-sm text-gray-700">{row.driver.name}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </td>
                <td className="h-[72px] px-6 py-4">
                  <StatusBadge status={row.status as BookingStatus} />
                </td>
                <td className="h-[72px] p-4" onClick={e => e.stopPropagation()}>
                  {(() => {
                    const handlers = {
                      onView:           () => setDutyDrawer({ open: true, mode: 'view', row }),
                      onEdit:           () => setDutyDrawer({ open: true, mode: 'edit', row }),
                      onViewBooking:    () => setViewBookingId(row.bookingId),
                      onAllot:          () => setAllotDuty(row),
                      onChangeDriver:   () => setChangeDriverDuty(row),
                      onPrintSlip:      () => {},
                      onClearAllotment: () => setClearAllotTarget(row),
                      onRestore:        () => setRestoreTarget(row),
                      onCancel:         () => handleCancel(row),
                    }
                    const items = getDutyActions(row, handlers)
                    return items.length > 0 ? <ActionsMenu items={items} /> : null
                  })()}
                </td>
              </tr>
            ))}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-gray-400">
                  {search ? 'No duties match your search.' : 'No duties found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-1" />
        {loadingMore && (
          <div className="py-4 text-center text-sm text-gray-400">Loading more…</div>
        )}
        </div>
      </div>

      {/* View / Edit duty drawer */}
      <DutyDrawer
        open={dutyDrawer.open}
        mode={dutyDrawer.mode}
        initial={dutyDrawer.row ? {
          dutyType:      dutyDrawer.row.dutyType,
          vehicleGroup:  dutyDrawer.row.vehicleGroup ?? '',
          reportingTime: dutyDrawer.row.repTime,
          startDate: (() => { const [dd, mm, yyyy] = dutyDrawer.row.startDate.split('/'); return `${yyyy}-${mm}-${dd}` })(),
          endDate:   (() => { const [dd, mm, yyyy] = dutyDrawer.row.endDate.split('/');   return `${yyyy}-${mm}-${dd}` })(),
        } : undefined}
        onClose={() => setDutyDrawer(prev => ({ ...prev, open: false }))}
        onSave={async form => {
          if (!dutyDrawer.row) return
          await supabase.from('duties').update({
            duty_type:      form.dutyType,
            vehicle_group:  form.vehicleGroup,
            start_date:     form.startDate,
            end_date:       form.endDate,
            reporting_time: form.reportingTime,
          }).eq('id', dutyDrawer.row.id)
          setRows(prev => prev.map(d => d.id === dutyDrawer.row!.id ? {
            ...d,
            dutyType:  form.dutyType,
            vehicleGroup: form.vehicleGroup,
            startDate: isoToDisplay(form.startDate),
            endDate:   isoToDisplay(form.endDate),
            repTime:   form.reportingTime,
          } : d))
          setDutyDrawer(prev => ({ ...prev, open: false }))
        }}
      />

      {/* Allot / Re-allot drawer */}
      <AllotDrawer
        open={allotDuty !== null}
        duty={allotDuty ? {
          id:           allotDuty.id,
          date:         allotDuty.startDate,
          endDate:      allotDuty.endDate,
          repTime:      allotDuty.repTime,
          dutyType:     allotDuty.dutyType,
          vehicleGroup: allotDuty.vehicleGroup,
        } : null}
        onClose={() => setAllotDuty(null)}
        onAllot={async (vehicle, driver) => {
          if (allotDuty) await handleAllot(allotDuty, vehicle, driver)
          setAllotDuty(null)
        }}
      />

      {/* Change driver — driver-only mode */}
      <AllotDrawer
        open={changeDriverDuty !== null}
        duty={changeDriverDuty ? {
          id:           changeDriverDuty.id,
          date:         changeDriverDuty.startDate,
          repTime:      changeDriverDuty.repTime,
          dutyType:     changeDriverDuty.dutyType,
          vehicleGroup: changeDriverDuty.vehicleGroup,
        } : null}
        driverOnlyMode
        currentVehicle={changeDriverDuty?.vehicleId ? {
          id:             changeDriverDuty.vehicleId,
          modelName:      changeDriverDuty.vehicleName ?? '',
          vehicleNumber:  changeDriverDuty.vehicleNumber ?? '',
          vehicleGroup:   changeDriverDuty.vehicleGroup ?? '',
          assignedDriver: null,
        } : undefined}
        onClose={() => setChangeDriverDuty(null)}
        onAllot={async (_vehicle, driver) => {
          if (changeDriverDuty) await handleChangeDriver(changeDriverDuty, driver)
          setChangeDriverDuty(null)
        }}
      />

      <ClearAllotmentModal
        open={clearAllotTarget !== null}
        vehicleName={clearAllotTarget?.vehicleName}
        vehicleNumber={clearAllotTarget?.vehicleNumber}
        driverName={clearAllotTarget?.driver?.name}
        onClose={() => setClearAllotTarget(null)}
        onConfirm={async () => {
          if (clearAllotTarget) await handleClearAllotment(clearAllotTarget)
          setClearAllotTarget(null)
        }}
      />

      <RestoreDutyModal
        open={restoreTarget !== null}
        onClose={() => setRestoreTarget(null)}
        onConfirm={async () => {
          if (restoreTarget) await handleRestore(restoreTarget)
          setRestoreTarget(null)
        }}
      />

      {/* View booking slide-in */}
      <AddBookingDrawer
        open={viewBookingId !== null}
        mode="view"
        bookingId={viewBookingId ?? undefined}
        onClose={() => setViewBookingId(null)}
        onSaved={() => setViewBookingId(null)}
      />
    </div>
  )
}
