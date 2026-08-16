import { clsx } from 'clsx'
import Drawer from '../../components/ui/Drawer'
import type { AttendanceEntry } from './AttendancePage'

// ── helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Last 30 days (inclusive of today), most recent first. */
function last30(): string[] {
  const out: string[] = []
  const today = new Date()
  for (let i = 0; i < 30; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    out.push(toDateStr(d))
  }
  return out
}

function fmtDay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── component ─────────────────────────────────────────────────────────────────

export default function AttendanceLogPanel({ driver, entries, onClose }: {
  driver: { id: number; name: string }
  entries: Record<string, AttendanceEntry>
  onClose: () => void
}) {
  const days = last30()
  const marked = days.filter(d => entries[d])
  const present = marked.filter(d => entries[d].status === 'P').length
  const absent = marked.filter(d => entries[d].status === 'A').length
  const unmarked = days.length - marked.length
  const rate = present + absent > 0 ? Math.round((present / (present + absent)) * 100) : null

  return (
    <Drawer
      open
      onClose={onClose}
      title="Attendance Log"
      description={`For ${driver.name} — Last 30 days`}
    >
      <div className="flex flex-col gap-6">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Present" value={present} className="bg-green-50 border-green-200 text-green-700" />
          <Stat label="Absent"  value={absent}  className="bg-red-50 border-red-200 text-red-600" />
          <Stat label="Unmarked" value={unmarked} className="bg-gray-50 border-gray-200 text-gray-600" />
        </div>
        {rate !== null && (
          <p className="text-sm text-gray-500 -mt-3">
            Attendance rate <span className="font-semibold text-gray-700">{rate}%</span> across {present + absent} marked days.
          </p>
        )}

        {/* Day list */}
        {marked.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">No attendance marked in the last 30 days.</p>
        ) : (
          <div className="rounded-xl border border-gray-200 shadow-xs overflow-hidden">
            {marked.map((d, i) => {
              const e = entries[d]
              const isAbsent = e.status === 'A'
              return (
                <div key={d} className={clsx('flex items-start gap-3 px-4 py-3', i > 0 && 'border-t border-gray-200')}>
                  <span className="w-28 shrink-0 text-sm font-medium text-gray-900">{fmtDay(d)}</span>
                  <div className="flex-1 min-w-0">
                    <span className={clsx(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                      isAbsent ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-700',
                    )}>
                      <span className={clsx('size-1.5 rounded-full', isAbsent ? 'bg-red-400' : 'bg-green-500')} />
                      {isAbsent ? 'Absent' : 'Present'}
                    </span>
                    {isAbsent && (
                      <p className={clsx('mt-1 text-sm', e.note ? 'text-gray-600' : 'text-gray-400 italic')}>
                        {e.note || 'No reason recorded'}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Drawer>
  )
}

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={clsx('rounded-xl border px-3.5 py-3', className)}>
      <p className="text-2xl font-semibold leading-8">{value}</p>
      <p className="text-xs font-medium opacity-80 mt-0.5">{label}</p>
    </div>
  )
}
