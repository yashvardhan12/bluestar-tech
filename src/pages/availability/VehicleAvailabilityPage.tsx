import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Search, Hash, Calendar, RotateCcw } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'

// ── types ─────────────────────────────────────────────────────────────────────

interface Vehicle {
  id: number
  modelName: string
  vehicleNumber: string
}

interface DutyEntry {
  id: number
  vehicleId: number
  startDate: string  // YYYY-MM-DD
  endDate: string
  bookingId: number
  bookingRef: string
  driverName: string
}

interface TooltipState {
  dutyId: number
  bookingRef: string
  driverName: string
  x: number
  y: number
}

// ── constants ─────────────────────────────────────────────────────────────────

const VEHICLE_W  = 188   // px — sticky first column
const MIN_COL_W  = 100   // px — min date column before horizontal scroll kicks in
const VERT_PAD   = 10    // px — top/bottom padding inside every row
const LANE_GAP   = 4     // px — vertical gap between stacked booking bars
const FULL_BAR_H = 36    // px — bar height when showing ref + driver
const COMP_BAR_H = 26    // px — bar height when showing ref only
const BAR_INSET  = 4     // px — small inset from left/right edge of a cell
const MIN_ROW_H  = 72    // px — minimum row height

// ── helpers ───────────────────────────────────────────────────────────────────

function isoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = []
  let cur = start
  while (cur <= end) {
    dates.push(cur)
    cur = addDays(cur, 1)
  }
  return dates
}

function fmtHeader(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const n = d.getDate()
  const sfx = n === 1 || n === 21 || n === 31 ? 'st'
    : n === 2 || n === 22 ? 'nd'
    : n === 3 || n === 23 ? 'rd' : 'th'
  return `${n}${sfx} ${d.toLocaleString('en-US', { month: 'short' })}`
}

// Color palette — cycles per booking index for a vehicle
const COLORS = [
  { bg: '#f0f9ff', border: '#b9e6fe', text: '#344054', icon: '#36bffa' },
  { bg: '#ecfdf3', border: '#abefc6', text: '#344054', icon: '#47cd89' },
  { bg: '#fff4ed', border: '#ffd6ae', text: '#344054', icon: '#fd853a' },
  { bg: '#fdf4ff', border: '#e9d7fe', text: '#344054', icon: '#b692f6' },
]

/**
 * Assigns a vertical lane (0, 1, 2…) to each duty so that overlapping duties
 * on the same vehicle are stacked rather than drawn on top of each other.
 */
function assignLanes(duties: DutyEntry[]): Map<number, number> {
  const sorted = [...duties].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const laneEnds: string[] = []
  const result = new Map<number, number>()
  for (const d of sorted) {
    let lane = laneEnds.findIndex(end => d.startDate > end)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = d.endDate
    result.set(d.id, lane)
  }
  return result
}

function calcRowHeight(numLanes: number, fullMode: boolean): number {
  if (numLanes === 0) return MIN_ROW_H
  const barH = fullMode ? FULL_BAR_H : COMP_BAR_H
  return Math.max(MIN_ROW_H, VERT_PAD * 2 + numLanes * barH + (numLanes - 1) * LANE_GAP)
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function VehicleAvailabilityPage() {
  const today = isoToday()

  const [rangeStart, setRangeStart] = useState(today)
  const [rangeEnd,   setRangeEnd]   = useState(addDays(today, 6))
  const [search,     setSearch]     = useState('')
  const [vehicles,   setVehicles]   = useState<Vehicle[]>([])
  const [duties,     setDuties]     = useState<DutyEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [colWidth,   setColWidth]   = useState(MIN_COL_W)
  const [tooltip,        setTooltip]        = useState<TooltipState | null>(null)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const tooltipHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const navigate = useNavigate()
  const tableRef = useRef<HTMLDivElement>(null)

  const showTooltip = (state: TooltipState) => {
    if (tooltipHideTimer.current) clearTimeout(tooltipHideTimer.current)
    setTooltip(state)
    setTooltipVisible(true)
  }

  const hideTooltip = () => {
    setTooltipVisible(false)
    tooltipHideTimer.current = setTimeout(() => setTooltip(null), 300)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: vData }, { data: dData }] = await Promise.all([
      supabase.from('vehicles').select('id, model_name, vehicle_number').order('model_name'),
      supabase
        .from('duties')
        .select('id, vehicle_id, booking_id, start_date, end_date, status, bookings(booking_ref), drivers(name)')
        .not('vehicle_id', 'is', null)
        .lte('start_date', rangeEnd)
        .gte('end_date', rangeStart)
        .neq('status', 'Cancelled'),
    ])

    setVehicles((vData ?? []).map((v: any) => ({
      id: v.id, modelName: v.model_name, vehicleNumber: v.vehicle_number,
    })))
    setDuties((dData ?? []).map((d: any) => ({
      id: d.id, vehicleId: d.vehicle_id,
      bookingId: d.booking_id,
      startDate: d.start_date, endDate: d.end_date,
      bookingRef: d.bookings?.booking_ref ?? '—',
      driverName: d.drivers?.name ?? '',
    })))
    setLoading(false)
  }, [rangeStart, rangeEnd])

  useEffect(() => { fetchData() }, [fetchData])

  // ── column width: fill equally, collapse to MIN_COL_W + scroll beyond that ──

  const dates = getDatesInRange(rangeStart, rangeEnd)

  useEffect(() => {
    const el = tableRef.current
    if (!el) return
    const compute = () => {
      const containerW = el.getBoundingClientRect().width
      const dateAreaW  = containerW - VEHICLE_W
      setColWidth(Math.max(MIN_COL_W, dateAreaW / dates.length))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [dates.length])

  // ── derived ──────────────────────────────────────────────────────────────────

  const filtered = vehicles.filter(v => {
    const q = search.toLowerCase()
    return !q || v.modelName.toLowerCase().includes(q) || v.vehicleNumber.toLowerCase().includes(q)
  })

  const totalW = VEHICLE_W + dates.length * colWidth

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* Page header */}
      <div className="border-b border-gray-200 pb-5">
        <h1 className="text-[30px] font-semibold leading-[38px] text-gray-900">Vehicle Availability</h1>
        <p className="text-base font-normal text-gray-500 leading-6 mt-0.5">
          Track which vehicles are booked day by day
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4">

        <div className="relative w-[480px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Search by vehicle name or plate number"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-[38px] pr-3.5 py-2.5 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Calendar className="size-4 text-gray-400 shrink-0" strokeWidth={1.75} />
          <input
            type="date" value={rangeStart} min={today}
            onChange={e => { const v = e.target.value; setRangeStart(v); if (v > rangeEnd) setRangeEnd(v) }}
            className="h-10 px-3 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] focus:border-violet-400 focus:ring-4 focus:ring-violet-100 outline-none transition-shadow cursor-pointer"
          />
          <span className="text-sm text-gray-400">–</span>
          <input
            type="date" value={rangeEnd} min={rangeStart}
            onChange={e => setRangeEnd(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] focus:border-violet-400 focus:ring-4 focus:ring-violet-100 outline-none transition-shadow cursor-pointer"
          />
          <button
            type="button"
            onClick={() => { setRangeStart(today); setRangeEnd(addDays(today, 6)) }}
            title="Reset to next 7 days"
            className="h-10 w-10 flex items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors cursor-pointer shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]"
          >
            <RotateCcw className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div
        ref={tableRef}
        className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]"
      >
        <div className="overflow-x-auto">
          <div style={{ width: totalW }}>

            {/* ── Header row ── */}
            <div className="flex border-b border-gray-200" style={{ height: 44 }}>

              {/* Vehicle header — sticky */}
              <div
                className="sticky left-0 z-20 bg-gray-50 border-r border-gray-200 flex items-center px-6 shrink-0"
                style={{ width: VEHICLE_W }}
              >
                <span className="text-xs font-medium text-gray-500">Vehicle</span>
              </div>

              {/* Date headers */}
              {dates.map(date => {
                const isToday = date === today
                return (
                  <div
                    key={date}
                    className={clsx(
                      'shrink-0 flex flex-col items-center justify-center border-r border-gray-200',
                      isToday ? 'bg-violet-50' : 'bg-gray-50',
                    )}
                    style={{ width: colWidth }}
                  >
                    <span className={clsx('text-xs font-medium', isToday ? 'text-violet-700' : 'text-gray-500')}>
                      {fmtHeader(date)}
                    </span>
                    {isToday && (
                      <span className="text-[10px] font-medium text-violet-400 leading-none mt-0.5">Today</span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── Loading ── */}
            {loading && (
              <div className="flex items-center justify-center h-40 text-sm text-gray-400">Loading…</div>
            )}

            {/* ── Empty ── */}
            {!loading && filtered.length === 0 && (
              <div className="flex items-center justify-center h-40 text-sm text-gray-400">
                {search ? 'No vehicles match your search.' : 'No vehicles found.'}
              </div>
            )}

            {/* ── Vehicle rows ── */}
            {!loading && filtered.map(vehicle => {
              // All duties visible for this vehicle in the selected range
              const vDuties  = duties.filter(d => d.vehicleId === vehicle.id)
              const lanes    = assignLanes(vDuties)
              const numLanes = vDuties.length > 0 ? Math.max(...Array.from(lanes.values())) + 1 : 0
              const fullMode = numLanes <= 1
              const barH     = fullMode ? FULL_BAR_H : COMP_BAR_H
              const rh       = calcRowHeight(numLanes, fullMode)

              return (
                <div
                  key={vehicle.id}
                  className="flex border-b border-gray-200 last:border-b-0"
                  style={{ height: rh }}
                >
                  {/* Vehicle cell — sticky */}
                  <div
                    className="sticky left-0 z-10 bg-white border-r border-gray-200 flex flex-col justify-center px-6 shrink-0"
                    style={{ width: VEHICLE_W }}
                  >
                    <p className="text-sm font-medium text-gray-900 truncate">{vehicle.modelName}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{vehicle.vehicleNumber}</p>
                  </div>

                  {/* Date area — grid background + absolute booking bars */}
                  <div className="relative overflow-hidden" style={{ width: dates.length * colWidth, height: rh }}>

                    {/* Grid background: column dividers + today tint */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {dates.map(date => (
                        <div
                          key={date}
                          className={clsx('h-full border-r border-gray-200 shrink-0', date === today && 'bg-violet-50/25')}
                          style={{ width: colWidth }}
                        />
                      ))}
                    </div>

                    {/* Booking bars — one continuous bar per duty */}
                    {vDuties.map((duty, colorIdx) => {
                      const lane = lanes.get(duty.id) ?? 0
                      const c    = COLORS[colorIdx % COLORS.length]

                      // Clamp to visible range
                      const visStart = duty.startDate < rangeStart ? rangeStart : duty.startDate
                      const visEnd   = duty.endDate   > rangeEnd   ? rangeEnd   : duty.endDate
                      const startIdx = dates.indexOf(visStart)
                      const endIdx   = dates.indexOf(visEnd)
                      if (startIdx === -1 || endIdx === -1) return null

                      const spanCols = endIdx - startIdx + 1
                      const barLeft  = startIdx * colWidth + BAR_INSET
                      const barWidth = spanCols * colWidth - BAR_INSET * 2
                      const barTop   = VERT_PAD + lane * (barH + LANE_GAP)

                      // Only round corners where the booking starts/ends within the visible range
                      const roundL = duty.startDate >= rangeStart
                      const roundR = duty.endDate   <= rangeEnd
                      const radius = roundL && roundR ? '4px'
                        : roundL ? '4px 0 0 4px'
                        : roundR ? '0 4px 4px 0'
                        : '0'

                      return (
                        <div
                          key={duty.id}
                          className="absolute border flex flex-col justify-center overflow-hidden cursor-pointer"
                          style={{
                            left:            barLeft,
                            top:             barTop,
                            width:           barWidth,
                            height:          barH,
                            backgroundColor: c.bg,
                            borderColor:     c.border,
                            borderRadius:    radius,
                            paddingLeft:     8,
                            paddingRight:    8,
                          }}
                          onMouseEnter={e => {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            showTooltip({
                              dutyId:     duty.id,
                              bookingRef: duty.bookingRef,
                              driverName: duty.driverName,
                              x:          rect.left + rect.width / 2,
                              y:          rect.top,
                            })
                          }}
                          onMouseLeave={hideTooltip}
                          onClick={() => {
                            hideTooltip()
                            navigate(`/bookings/${duty.bookingId}`, { state: { openDutyId: duty.id } })
                          }}
                        >
                          {/* Booking ref */}
                          <div className="flex items-center gap-[2px]">
                            <Hash className="size-3 shrink-0" strokeWidth={2.25} style={{ color: c.icon }} />
                            <span
                              className="text-xs font-medium truncate leading-[18px]"
                              style={{ color: c.text }}
                            >
                              {duty.bookingRef}
                            </span>
                          </div>
                          {/* Driver — full mode only */}
                          {fullMode && duty.driverName && (
                            <p className="text-[11px] font-normal text-gray-500 leading-[18px] truncate pl-[14px]">
                              {duty.driverName}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

          </div>
        </div>
      </div>
    </div>

    {/* Booking tooltip portal */}
    {tooltip && createPortal(
      <div
        className={`pointer-events-none fixed z-[9999] ${tooltipVisible ? 'animate-[fadeIn_0.3s_ease]' : 'animate-[fadeOut_0.3s_ease_forwards]'}`}
        style={{
          left: tooltip.x,
          top:  tooltip.y - 8,
          transform: 'translate(-50%, -100%)',
        }}
      >
        <div
          className="rounded-lg px-3 py-2 text-xs whitespace-nowrap"
          style={{
            backgroundColor: '#0c111d',
            boxShadow: '0px 12px 16px rgba(16,24,40,0.08), 0px 4px 6px rgba(16,24,40,0.03)',
          }}
        >
          <p className="text-white leading-5">
            <span className="font-semibold">Booking ID: </span>
            <span className="font-normal">{tooltip.bookingRef}</span>
          </p>
          {tooltip.driverName && (
            <p className="text-white leading-5">
              <span className="font-semibold">Driver: </span>
              <span className="font-normal">{tooltip.driverName}</span>
            </p>
          )}
        </div>
        {/* Downward arrow */}
        <div
          className="mx-auto"
          style={{
            width: 0,
            height: 0,
            borderLeft:  '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop:   '6px solid #0c111d',
          }}
        />
      </div>,
      document.body,
    )}
    </>
  )
}
