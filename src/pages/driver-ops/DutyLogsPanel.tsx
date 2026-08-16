import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'
import Drawer from '../../components/ui/Drawer'
import StatusBadge, { type BookingStatus } from '../../components/ui/StatusBadge'

interface DutyRow {
  id: number
  status: BookingStatus
  repTime: string
  bookingId: number | null
  bookingRef: string
  vehicle: string
}

interface DutyGroup {
  date: string        // ISO YYYY-MM-DD
  rows: DutyRow[]
}

// ── helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** ISO date → "Aug 28, 2024" */
function fmtDateHeader(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "17:00:00" → "5:00 PM" */
function fmtTime(t: string | null): string {
  if (!t) return '—'
  const [h, m] = t.split(':')
  const hour = Number(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${m} ${ampm}`
}

const isSlipStatus = (s: BookingStatus) => s === 'Completed' || s === 'Billed'

// ── component ─────────────────────────────────────────────────────────────────

export default function DutyLogsPanel({ driver, onClose }: {
  driver: { id: number; name: string }
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<DutyGroup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const since = new Date()
      since.setDate(since.getDate() - 29) // last 30 days inclusive of today

      const { data } = await supabase
        .from('duties')
        .select('id, status, start_date, reporting_time, booking_id, bookings(booking_ref), vehicles(model_name, vehicle_number)')
        .eq('driver_id', driver.id)
        .gte('start_date', toDateStr(since))
        .order('start_date', { ascending: false })

      if (cancelled) return

      const byDate = new Map<string, DutyRow[]>()
      for (const r of (data ?? []) as any[]) {
        const row: DutyRow = {
          id: Number(r.id),
          status: r.status as BookingStatus,
          repTime: fmtTime(r.reporting_time),
          bookingId: r.booking_id != null ? Number(r.booking_id) : null,
          bookingRef: r.bookings?.booking_ref ?? '—',
          vehicle: r.vehicles ? `${r.vehicles.model_name} · ${r.vehicles.vehicle_number}` : 'Not allotted',
        }
        if (!byDate.has(r.start_date)) byDate.set(r.start_date, [])
        byDate.get(r.start_date)!.push(row)
      }
      setGroups([...byDate.entries()].map(([date, rows]) => ({ date, rows })))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [driver.id])

  function openDuty(row: DutyRow) {
    if (row.bookingId == null) return
    navigate(`/bookings/${row.bookingId}`, { state: { openDutyId: row.id } })
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Duty Logs"
      description={`For ${driver.name} — Last 30 days`}
      width="w-[680px]"
    >
      {loading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Loading duty logs…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-gray-400 py-16 text-center">No duties in the last 30 days.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(group => (
            <div key={group.date} className="flex flex-col gap-2">
              <p className="text-md font-semibold text-gray-700">{fmtDateHeader(group.date)}</p>
              <div className="rounded-xl border border-gray-200 shadow-xs overflow-hidden">
                {group.rows.map((row, i) => {
                  const slip = isSlipStatus(row.status)
                  return (
                    <button
                      key={row.id}
                      type="button"
                      disabled={slip || row.bookingId == null}
                      onClick={() => openDuty(row)}
                      title={slip ? 'Duty slips coming soon' : 'View duty'}
                      className={clsx(
                        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                        i > 0 && 'border-t border-gray-200',
                        'enabled:hover:bg-gray-50 enabled:cursor-pointer disabled:cursor-default',
                      )}
                    >
                      {/* Time + booking ref */}
                      <div className="flex flex-col items-start min-w-[92px]">
                        <span className="text-sm font-medium text-gray-900">#{row.bookingRef}</span>
                        <span className="text-sm text-gray-500">{row.repTime}</span>
                      </div>
                      {/* Vehicle */}
                      <span className="flex-1 text-left text-sm text-gray-600 truncate">{row.vehicle}</span>
                      {/* Status */}
                      <StatusBadge status={row.status} />
                      {/* Trailing affordance */}
                      {slip ? (
                        <span className="inline-flex items-center gap-1 shrink-0 w-[86px] justify-end text-xs font-medium text-gray-400">
                          Duty slip
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">Soon</span>
                        </span>
                      ) : (
                        <ChevronRight className="size-4 shrink-0 text-gray-400" strokeWidth={1.75} />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  )
}
