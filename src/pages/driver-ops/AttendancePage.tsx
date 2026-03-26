import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, MoreHorizontal, X, UserCog, ClipboardList, Calendar } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'
import DateRangePicker, { type DateRange } from '../../components/ui/DateRangePicker'

// ── types ─────────────────────────────────────────────────────────────────────

type Status = 'P' | 'A'

interface DriverRow {
  id: number
  name: string
  initials: string
  phone: string | null
}

interface AttendanceMap {
  [driverId: number]: { [dateStr: string]: Status }
}

// ── helpers ───────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${ordinal(d.getDate())} ${MONTHS[d.getMonth()]}`
}

/** Generate array of YYYY-MM-DD strings from start to end inclusive */
function dateRange(start: string, end: string): string[] {
  const result: string[] = []
  const cur = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  while (cur <= last) {
    result.push(toDateStr(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return result
}

/** Default: today and the 6 preceding days */
function defaultDates(): string[] {
  const today = new Date()
  const dates: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    dates.push(toDateStr(d))
  }
  return dates
}

// ── avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
]

function Avatar({ initials, index }: { initials: string; index: number }) {
  return (
    <span className={clsx('size-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0', AVATAR_COLORS[index % AVATAR_COLORS.length])}>
      {initials}
    </span>
  )
}

// ── attendance cell ───────────────────────────────────────────────────────────

function AttendanceCell({ status, onClick }: { status: Status | undefined; onClick: () => void }) {
  return (
    <td className="p-1.5" style={{ minWidth: 72 }}>
      <button
        onClick={onClick}
        className={clsx(
          'w-full h-full min-h-[48px] flex items-center justify-center rounded-md text-sm font-semibold transition-colors cursor-pointer',
          !status && 'border-2 border-dashed border-gray-200 text-gray-300 hover:border-violet-300 hover:text-violet-400',
          status === 'P' && 'bg-green-100 text-green-700 hover:bg-green-200',
          status === 'A' && 'bg-red-100 text-red-600 hover:bg-red-200',
        )}
      >
        {status ?? '+'}
      </button>
    </td>
  )
}

// ── row menu ──────────────────────────────────────────────────────────────────

function RowMenu({ onMarkAttendance, onViewDutyLogs }: {
  onMarkAttendance: () => void
  onViewDutyLogs: () => void
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, right: 0 })
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
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpen(v => !v)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <MoreHorizontal className="size-4" strokeWidth={1.75} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, right: coords.right, zIndex: 9999 }}
          className="w-48 bg-white border border-gray-200 rounded-lg shadow-[0px_8px_16px_-4px_rgba(16,24,40,0.08)] py-1 overflow-hidden"
        >
          <div className="px-1.5 py-px">
            <button
              type="button"
              onClick={() => { onMarkAttendance(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <UserCog className="size-4 text-gray-500 shrink-0" strokeWidth={1.75} />
              Mark attendance
            </button>
          </div>
          <div className="px-1.5 py-px">
            <button
              type="button"
              onClick={() => { onViewDutyLogs(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <ClipboardList className="size-4 text-gray-500 shrink-0" strokeWidth={1.75} />
              View duty logs
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// ── mark attendance modal ─────────────────────────────────────────────────────

function MarkAttendanceModal({ driver, onClose, onMark }: {
  driver: DriverRow
  onClose: () => void
  onMark: (driverId: number, dates: string[], status: Status) => Promise<void>
}) {
  const today = toDateStr(new Date())
  const [tab, setTab] = useState<'today' | 'select'>('today')
  const [range, setRange] = useState<DateRange | null>(null)
  const [marking, setMarking] = useState(false)

  // Dates that will be updated on confirm
  const datesToMark: string[] = tab === 'today'
    ? [today]
    : range ? dateRange(toDateStr(range.start), toDateStr(range.end)) : []

  const canMark = datesToMark.length > 0

  function fmtDisplay(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  async function handle(status: Status) {
    if (!canMark) return
    setMarking(true)
    await onMark(driver.id, datesToMark, status)
    setMarking(false)
    onClose()
  }

  const dateLabel = tab === 'today'
    ? fmtDisplay(today)
    : range
      ? datesToMark.length === 1
        ? fmtDisplay(datesToMark[0])
        : `${datesToMark.length} dates selected`
      : null

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Card — no overflow-hidden so the date picker popup can escape */}
      <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-[292px] flex flex-col gap-2 py-2">

        {/* Section header */}
        <div className="flex flex-col gap-2 pt-2 px-2">

          {/* Title + close */}
          <div className="flex items-start justify-between pl-1 pr-0">
            <div>
              <p className="text-base font-semibold text-gray-900">Attendance</p>
              <p className="text-xs text-gray-500 mt-0.5">For {driver.name}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <X className="size-5" strokeWidth={1.75} />
            </button>
          </div>

          {/* Today / Select Date(s) toggle */}
          <div className="flex gap-2 bg-gray-100 border border-gray-200 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setTab('today')}
              className={clsx(
                'flex-1 h-9 flex items-center justify-center rounded-md text-sm font-semibold transition-all cursor-pointer',
                tab === 'today' ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setTab('select')}
              className={clsx(
                'flex-1 h-9 flex items-center justify-center rounded-md text-sm font-semibold transition-all cursor-pointer',
                tab === 'select' ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              Select Date(s)
            </button>
          </div>
        </div>

        {/* Date display / picker */}
        <div className="px-2">
          {tab === 'today' ? (
            <div className="flex items-center gap-2 px-3.5 py-2.5 border border-gray-300 rounded-lg bg-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
              <Calendar className="size-5 text-gray-500 shrink-0" strokeWidth={1.75} />
              <span className="text-sm font-semibold text-gray-500">{fmtDisplay(today)}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <DateRangePicker
                value={range}
                onChange={setRange}
                placeholder="Pick date range"
                className="w-full [&>button]:w-full"
              />
              {dateLabel && (
                <p className="text-xs text-gray-500 px-1">{dateLabel}</p>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100" />

        {/* Footer buttons */}
        <div className="flex gap-3 px-3 py-1">
          <button
            type="button"
            onClick={() => handle('A')}
            disabled={marking || !canMark}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] disabled:opacity-50 cursor-pointer transition-colors"
          >
            Mark Absent
          </button>
          <button
            type="button"
            onClick={() => handle('P')}
            disabled={marking || !canMark}
            className="flex-1 py-2 bg-violet-600 rounded-lg text-sm font-semibold text-white hover:bg-violet-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] disabled:opacity-50 cursor-pointer transition-colors"
          >
            Mark Present
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [attendance, setAttendance] = useState<AttendanceMap>({})
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<DateRange | null>(null)
  const [markDriver, setMarkDriver] = useState<DriverRow | null>(null)

  const dates = range
    ? dateRange(toDateStr(range.start), toDateStr(range.end))
    : defaultDates()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: driverData }, { data: attendData }] = await Promise.all([
      supabase.from('drivers').select('id, name, initials, phone').order('created_at', { ascending: false }),
      supabase.from('driver_attendance').select('driver_id, date, status'),
    ])

    if (driverData) {
      setDrivers(driverData.map((d: any) => ({ ...d, id: Number(d.id) })))
    }
    if (attendData) {
      const map: AttendanceMap = {}
      for (const r of attendData as any[]) {
        const id = Number(r.driver_id)
        if (!map[id]) map[id] = {}
        map[id][r.date] = r.status as Status
      }
      setAttendance(map)
    }
  }

  async function toggleAttendance(driverId: number, dateStr: string) {
    const current = attendance[driverId]?.[dateStr]
    const next: Status = current === 'P' ? 'A' : 'P'

    // Optimistic update
    setAttendance(prev => ({
      ...prev,
      [driverId]: { ...(prev[driverId] ?? {}), [dateStr]: next },
    }))

    await supabase.from('driver_attendance').upsert(
      { driver_id: driverId, date: dateStr, status: next },
      { onConflict: 'driver_id,date' },
    )
  }

  async function setAttendanceForDate(driverId: number, dates: string[], status: Status) {
    // Optimistic update for all dates
    setAttendance(prev => ({
      ...prev,
      [driverId]: {
        ...(prev[driverId] ?? {}),
        ...Object.fromEntries(dates.map(d => [d, status])),
      },
    }))
    // Bulk upsert
    await supabase.from('driver_attendance').upsert(
      dates.map(date => ({ driver_id: driverId, date, status })),
      { onConflict: 'driver_id,date' },
    )
  }

  const filtered = drivers.filter(d => {
    const q = search.toLowerCase()
    return !q || d.name.toLowerCase().includes(q) || (d.phone ?? '').toLowerCase().includes(q)
  })

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Controls bar */}
      <div className="px-10 py-5 flex items-center justify-between gap-4 shrink-0">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Search by name or phone"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-[38px] pr-3.5 py-2.5 w-72 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
          />
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker
            value={range}
            onChange={setRange}
            placeholder="Pick date range"
          />
          {range && (
            <button
              onClick={() => setRange(null)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
            >
              <X className="size-4" strokeWidth={2} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Scrollable table area */}
      <div className="flex-1 overflow-hidden px-10 pb-8">
        <div className="h-full overflow-auto rounded-xl border border-gray-200 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
          <table
            className="w-full border-collapse bg-white"
            style={{ minWidth: 220 + 52 + dates.length * 72 }}
          >
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">

                {/* Sticky left — Name */}
                <th
                  className="sticky left-0 z-20 bg-gray-50 h-[44px] px-6 text-left text-xs font-medium text-gray-600 whitespace-nowrap border-r border-gray-200"
                  style={{ minWidth: 220, width: 220 }}
                >
                  Name
                </th>

                {/* Scrollable date columns */}
                {dates.map(d => (
                  <th
                    key={d}
                    className="h-[44px] px-2 text-center text-xs font-medium text-gray-600 whitespace-nowrap"
                    style={{ minWidth: 72 }}
                  >
                    {fmtHeader(d)}
                  </th>
                ))}

                {/* Sticky right — Actions */}
                <th
                  className="sticky right-0 z-20 bg-gray-50 h-[44px] border-l border-gray-200"
                  style={{ minWidth: 52, width: 52 }}
                />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={dates.length + 2}
                    className="py-20 text-center text-sm text-gray-400"
                  >
                    {search ? 'No drivers match your search.' : 'No drivers found.'}
                  </td>
                </tr>
              ) : (
                filtered.map((driver, idx) => (
                  <tr key={driver.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50/50 transition-colors group">

                    {/* Sticky left — Name cell */}
                    <td
                      className="sticky left-0 z-10 bg-white group-hover:bg-gray-50/50 h-[72px] px-6 border-r border-gray-200"
                      style={{ minWidth: 220, width: 220 }}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar initials={driver.initials} index={idx} />
                        <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{driver.name}</span>
                      </div>
                    </td>

                    {/* Date attendance cells */}
                    {dates.map(d => (
                      <AttendanceCell
                        key={d}
                        status={attendance[driver.id]?.[d]}
                        onClick={() => toggleAttendance(driver.id, d)}
                      />
                    ))}

                    {/* Sticky right — Actions */}
                    <td
                      className="sticky right-0 z-10 bg-white group-hover:bg-gray-50/50 border-l border-gray-200 px-2"
                      style={{ minWidth: 52, width: 52 }}
                    >
                      <RowMenu
                        onMarkAttendance={() => setMarkDriver(driver)}
                        onViewDutyLogs={() => {}}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mark attendance modal */}
      {markDriver && (
        <MarkAttendanceModal
          driver={markDriver}
          onClose={() => setMarkDriver(null)}
          onMark={setAttendanceForDate}
        />
      )}
    </div>
  )
}
