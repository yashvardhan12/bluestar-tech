import React, { useState, useEffect } from 'react'
import { Search, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'
import DateRangePicker, { type DateRange } from '../../components/ui/DateRangePicker'

// ── types ──────────────────────────────────────────────────────────────────────

interface DutyRow {
  dutyId:      number
  driverId:    number
  driverName:  string
  initials:    string
  startDate:   string   // ISO
  endDate:     string   // ISO
  fuelUsed:    number   // pro-rated litres
}

interface VehicleRow {
  vehicleId:     number
  vehicleName:   string
  vehicleNumber: string
  duties:        DutyRow[]
  // computed
  activeDays:    number
  totalDays:     number
  totalFuel:     number
  uniqueDrivers: { id: number; name: string; initials: string }[]
}

// ── helpers ────────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function daysBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

function clampDate(date: string, lo: string, hi: string): string {
  if (date < lo) return lo
  if (date > hi) return hi
  return date
}

function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const lo = aStart > bStart ? aStart : bStart
  const hi = aEnd   < bEnd   ? aEnd   : bEnd
  if (lo > hi) return 0
  return daysBetween(lo, hi) + 1
}

function totalDaysInRange(rangeStart: string, rangeEnd: string): number {
  return daysBetween(rangeStart, rangeEnd) + 1
}

function isConsecutive(endDate: string, nextStartDate: string): boolean {
  const d = new Date(endDate)
  d.setDate(d.getDate() + 1)
  return toISO(d) === nextStartDate
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatFuel(l: number): string {
  if (l === 0) return '—'
  return l.toFixed(1) + ' L'
}

/** Generate a deterministic muted bg color for driver avatars */
const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
]
function avatarColor(id: number): string {
  return AVATAR_COLORS[id % AVATAR_COLORS.length]
}

// ── pro-ration engine ──────────────────────────────────────────────────────────

/**
 * Given sorted fuel logs for a vehicle and a list of duties,
 * compute how much fuel is attributable to each duty.
 *
 * Logic: between fuel log[i] and log[i+1], quantity[i+1] litres were
 * consumed. Pro-rate that across all duties that overlap with the interval
 * [log[i].date, log[i+1].date] by days of overlap.
 */
function computeFuelPerDuty(
  fuelLogs: { date: string; quantity: number }[],
  duties:   { dutyId: number; startDate: string; endDate: string }[],
): Map<number, number> {
  const result = new Map<number, number>(duties.map(d => [d.dutyId, 0]))

  for (let i = 0; i + 1 < fuelLogs.length; i++) {
    const intervalStart = fuelLogs[i].date
    const intervalEnd   = fuelLogs[i + 1].date
    const consumed      = fuelLogs[i + 1].quantity
    const intervalDays  = daysBetween(intervalStart, intervalEnd)
    if (intervalDays === 0) continue

    for (const duty of duties) {
      const overlap = overlapDays(duty.startDate, duty.endDate, intervalStart, intervalEnd)
      if (overlap === 0) continue
      const share = (overlap / intervalDays) * consumed
      result.set(duty.dutyId, (result.get(duty.dutyId) ?? 0) + share)
    }
  }

  return result
}

// ── avatar group ───────────────────────────────────────────────────────────────

function AvatarGroup({ drivers }: { drivers: { id: number; name: string; initials: string }[] }) {
  const MAX_SHOW = 3
  const shown    = drivers.slice(0, MAX_SHOW)
  const overflow = drivers.length - MAX_SHOW

  return (
    <div className="flex items-center">
      {shown.map((d, i) => (
        <span
          key={d.id}
          title={d.name}
          className={clsx(
            'size-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 border-white',
            avatarColor(d.id),
            i > 0 && '-ml-2',
          )}
        >
          {d.initials}
        </span>
      ))}
      {overflow > 0 && (
        <span className="-ml-2 size-7 rounded-full flex items-center justify-center text-xs font-medium bg-gray-100 text-gray-600 border-2 border-white">
          +{overflow}
        </span>
      )}
    </div>
  )
}

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
      <div className="relative flex flex-col items-center gap-3">
        <div className="size-20 rounded-full bg-gray-100 flex items-center justify-center">
          <div className="size-12 rounded-full bg-gray-700/60 flex items-center justify-center">
            <svg className="size-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-gray-900">No data for this period</p>
          <p className="mt-1 text-sm text-gray-500">Assign duties with vehicles and drivers to see averages.</p>
        </div>
      </div>
    </div>
  )
}

// ── page ───────────────────────────────────────────────────────────────────────

export default function AveragePage() {
  const today = new Date()
  const [range,    setRange]    = useState<DateRange>({ start: startOfMonth(today), end: endOfMonth(today) })
  const [rows,     setRows]     = useState<VehicleRow[]>([])
  const [search,   setSearch]   = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [loading,  setLoading]  = useState(true)

  const rangeStart = toISO(range.start)
  const rangeEnd   = toISO(range.end)

  useEffect(() => { fetchData() }, [rangeStart, rangeEnd])

  async function fetchData() {
    setLoading(true)

    // 1. Fetch duties within range with vehicle + driver info
    const { data: dutiesRaw } = await supabase
      .from('duties')
      .select('id, vehicle_id, start_date, end_date, vehicles(id, model_name, vehicle_number), drivers(id, name, initials)')
      .not('vehicle_id', 'is', null)
      .not('driver_id', 'is', null)
      .neq('status', 'Cancelled')
      .lte('start_date', rangeEnd)
      .gte('end_date', rangeStart)
      .lte('end_date', toISO(new Date()))

    if (!dutiesRaw || dutiesRaw.length === 0) { setRows([]); setLoading(false); return }

    // 2. Collect unique vehicle names to fetch fuel logs
    const vehicleMap = new Map<number, { id: number; name: string; number: string }>()
    for (const d of dutiesRaw) {
      const v = d.vehicles as any
      if (v) vehicleMap.set(v.id, { id: v.id, name: v.model_name, number: v.vehicle_number })
    }
    const vehicleNames = [...vehicleMap.values()].map(v => v.name)

    // 3. Fetch all fuel logs for these vehicles (unfiltered by date — need surrounding logs for pro-ration)
    const { data: fuelRaw } = await supabase
      .from('fuel_logs')
      .select('vehicle_name, vehicle_number, date, quantity')
      .in('vehicle_name', vehicleNames)
      .order('date', { ascending: true })

    // Group fuel logs by vehicle name+number
    const fuelByVehicle = new Map<string, { date: string; quantity: number }[]>()
    for (const f of fuelRaw ?? []) {
      const key = `${f.vehicle_name}|${f.vehicle_number}`
      if (!fuelByVehicle.has(key)) fuelByVehicle.set(key, [])
      fuelByVehicle.get(key)!.push({ date: f.date, quantity: Number(f.quantity) })
    }

    // Group duties by vehicle
    const dutiesByVehicle = new Map<number, typeof dutiesRaw>()
    for (const d of dutiesRaw) {
      const vid = (d.vehicles as any)?.id
      if (!vid) continue
      if (!dutiesByVehicle.has(vid)) dutiesByVehicle.set(vid, [])
      dutiesByVehicle.get(vid)!.push(d)
    }

    // 4. Build vehicle rows
    const totalDays = totalDaysInRange(rangeStart, rangeEnd)
    const result: VehicleRow[] = []

    for (const [vehicleId, duties] of dutiesByVehicle) {
      const vehicle = vehicleMap.get(vehicleId)
      if (!vehicle) continue

      const fuelKey  = `${vehicle.name}|${vehicle.number}`
      const fuelLogs = fuelByVehicle.get(fuelKey) ?? []

      // Clamp duty dates to selected range
      const clampedDuties = duties.map(d => ({
        dutyId:    d.id,
        startDate: clampDate(d.start_date, rangeStart, rangeEnd),
        endDate:   clampDate(d.end_date,   rangeStart, rangeEnd),
      }))

      const fuelMap = computeFuelPerDuty(fuelLogs, clampedDuties)

      // Count active days (union of all duty date ranges within period)
      const activeDaySet = new Set<string>()
      for (const cd of clampedDuties) {
        let cur = new Date(cd.startDate)
        const end = new Date(cd.endDate)
        while (cur <= end) {
          activeDaySet.add(toISO(cur))
          cur.setDate(cur.getDate() + 1)
        }
      }

      // Unique drivers
      const driversSeen = new Map<number, { id: number; name: string; initials: string }>()
      for (const d of duties) {
        const dr = d.drivers as any
        if (dr) driversSeen.set(dr.id, { id: dr.id, name: dr.name, initials: dr.initials })
      }

      const sortedDuties: DutyRow[] = duties.map(d => {
        const dr = d.drivers as any
        return {
          dutyId:     d.id,
          driverId:   dr?.id   ?? 0,
          driverName: dr?.name ?? '—',
          initials:   dr?.initials ?? '?',
          startDate:  clampDate(d.start_date, rangeStart, rangeEnd),
          endDate:    clampDate(d.end_date,   rangeStart, rangeEnd),
          fuelUsed:   fuelMap.get(d.id) ?? 0,
        }
      }).sort((a, b) => a.startDate.localeCompare(b.startDate))

      // Merge consecutive duties for the same driver into one row
      const dutyRows: DutyRow[] = []
      for (const duty of sortedDuties) {
        const prev = dutyRows[dutyRows.length - 1]
        if (prev && prev.driverId === duty.driverId && isConsecutive(prev.endDate, duty.startDate)) {
          prev.endDate  = duty.endDate
          prev.fuelUsed += duty.fuelUsed
        } else {
          dutyRows.push({ ...duty })
        }
      }

      result.push({
        vehicleId,
        vehicleName:   vehicle.name,
        vehicleNumber: vehicle.number,
        duties:        dutyRows,
        activeDays:    activeDaySet.size,
        totalDays,
        totalFuel:     dutyRows.reduce((s, r) => s + r.fuelUsed, 0),
        uniqueDrivers: [...driversSeen.values()],
      })
    }

    result.sort((a, b) => a.vehicleName.localeCompare(b.vehicleName))
    setRows(result)
    setLoading(false)
  }

  function toggleExpand(vehicleId: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(vehicleId) ? next.delete(vehicleId) : next.add(vehicleId)
      return next
    })
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    return !q || r.vehicleName.toLowerCase().includes(q) || r.vehicleNumber.toLowerCase().includes(q)
  })

  // ── th helper ───────────────────────────────────────────────────────────────

  const TH = ({ children, first }: { children: React.ReactNode; first?: boolean }) => (
    <th className={clsx(
      'h-[44px] px-6 text-left text-xs font-medium text-gray-500 bg-gray-50',
      first && 'border-r border-gray-200 w-[264px]',
    )}>
      {children}
    </th>
  )

  return (
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* Section header */}
      <div className="flex items-center justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Average</h2>
          <p className="mt-1 text-sm text-gray-500">Fuel average for all your vehicles</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
            <input
              type="text"
              placeholder="Search by car"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-[38px] pr-3.5 py-2.5 w-56 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
            />
          </div>
          <DateRangePicker
            value={range}
            onChange={r => { if (r) setRange(r) }}
            placeholder="Select date range"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <TH first>Vehicle Name and Number</TH>
              <TH>Active Days</TH>
              <TH>Driver(s)</TH>
              <TH>Distance</TH>
              <TH>Fuel Consumed</TH>
              <TH>Car Avg (km/L)</TH>
            </tr>
          </thead>
          <tbody>

            {/* Loading */}
            {loading && (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-gray-400">Loading…</td>
              </tr>
            )}

            {/* Empty */}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6}><EmptyState /></td></tr>
            )}


            {/* Vehicle rows */}
            {!loading && filtered.map(row => {
              const isExpanded = expanded.has(row.vehicleId)
              return (
                <React.Fragment key={row.vehicleId}>
                  {/* Main vehicle row */}
                  <tr
                    className="border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => toggleExpand(row.vehicleId)}
                  >
                    <td className="h-[72px] px-6 py-4 border-r border-gray-200">
                      <div className="flex items-center gap-3">
                        <ChevronRight
                          className={clsx('size-4 text-gray-400 shrink-0 transition-transform', isExpanded && 'rotate-90')}
                          strokeWidth={1.75}
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{row.vehicleName}</p>
                          <p className="text-sm text-gray-500 mt-0.5">{row.vehicleNumber}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {row.activeDays}/{row.totalDays}
                    </td>
                    <td className="px-6 py-4">
                      <AvatarGroup drivers={row.uniqueDrivers} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">—</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatFuel(row.totalFuel)}</td>
                    <td className="px-6 py-4 text-sm text-gray-400">—</td>
                  </tr>

                  {/* Sub-rows per duty */}
                  {isExpanded && row.duties.map(duty => (
                    <tr key={duty.dutyId} className="border-b border-gray-200 last:border-b-0 bg-gray-50">
                      <td className="h-[64px] px-6 py-4 border-r border-gray-200 pl-16">
                        <p className="text-sm text-gray-700">{formatDate(duty.startDate)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">to {formatDate(duty.endDate)}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {overlapDays(duty.startDate, duty.endDate, duty.startDate, duty.endDate)} days
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{duty.driverName}</td>
                      <td className="px-6 py-4 text-sm text-gray-400">—</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{formatFuel(duty.fuelUsed)}</td>
                      <td className="px-6 py-4 text-sm text-gray-400">—</td>
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}

          </tbody>
        </table>
      </div>

    </div>
  )
}
