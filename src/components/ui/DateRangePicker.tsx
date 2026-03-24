import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { clsx } from 'clsx'

export interface DateRange {
  start: Date
  end: Date
}

interface DateRangePickerProps {
  value?: DateRange | null
  onChange: (range: DateRange | null) => void
  placeholder?: string
}

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function getDaysInMonth(year: number, month: number): Date[] {
  const result: Date[] = []
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)

  // Start from Monday (ISO week)
  const startDow = (first.getDay() + 6) % 7 // 0=Mon … 6=Sun
  for (let i = 0; i < startDow; i++) {
    result.push(new Date(year, month, 1 - (startDow - i)))
  }
  for (let d = 1; d <= last.getDate(); d++) {
    result.push(new Date(year, month, d))
  }
  // Fill to complete last row
  const remaining = 7 - (result.length % 7)
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      result.push(new Date(year, month + 1, i))
    }
  }
  return result
}

function Calendar2({
  viewYear,
  viewMonth,
  selecting,
  confirmed,
  hover,
  onDayClick,
  onDayHover,
}: {
  viewYear: number
  viewMonth: number
  selecting: Date | null
  confirmed: DateRange | null
  hover: Date | null
  onDayClick: (d: Date) => void
  onDayHover: (d: Date | null) => void
}) {
  const days = getDaysInMonth(viewYear, viewMonth)

  // Determine effective range for highlighting
  let rangeStart: Date | null = null
  let rangeEnd: Date | null = null

  if (confirmed) {
    rangeStart = confirmed.start
    rangeEnd = confirmed.end
  } else if (selecting) {
    const hov = hover
    if (hov) {
      rangeStart = selecting < hov ? selecting : hov
      rangeEnd = selecting < hov ? hov : selecting
    } else {
      rangeStart = selecting
      rangeEnd = selecting
    }
  }

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="size-[40px] flex items-center justify-center text-xs font-medium text-gray-500">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const isCurrentMonth = day.getMonth() === viewMonth
          const isStart = rangeStart && isSameDay(day, rangeStart)
          const isEnd = rangeEnd && isSameDay(day, rangeEnd)
          const inRange = rangeStart && rangeEnd &&
            day >= startOfDay(rangeStart) && day <= startOfDay(rangeEnd)
          const isEdge = isStart || isEnd

          return (
            <button
              key={i}
              type="button"
              onClick={() => onDayClick(day)}
              onMouseEnter={() => onDayHover(day)}
              onMouseLeave={() => onDayHover(null)}
              className={clsx(
                'size-[40px] flex items-center justify-center text-sm relative',
                !isCurrentMonth && 'text-gray-400',
                isCurrentMonth && !isEdge && !inRange && 'text-gray-700 hover:bg-gray-100',
                inRange && !isEdge && 'bg-violet-50 text-gray-700',
                isEdge && 'bg-violet-600 text-white rounded-full z-10',
                isStart && rangeEnd && !isSameDay(rangeStart!, rangeEnd!) && 'rounded-l-none rounded-r-full',
                isEnd && rangeStart && !isSameDay(rangeStart!, rangeEnd!) && 'rounded-r-none rounded-l-full',
                (isEdge && (!rangeEnd || isSameDay(rangeStart!, rangeEnd!))) && 'rounded-full',
              )}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function DateRangePicker({ value, onChange, placeholder = 'Select date range' }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => value?.start.getFullYear() ?? new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => value?.start.getMonth() ?? new Date().getMonth())

  // Internal draft state while popover is open
  const [selecting, setSelecting] = useState<Date | null>(null) // first click waiting for second
  const [draft, setDraft] = useState<DateRange | null>(value ?? null)
  const [hover, setHover] = useState<Date | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function openPicker() {
    setDraft(value ?? null)
    setSelecting(null)
    setHover(null)
    if (value?.start) {
      setViewYear(value.start.getFullYear())
      setViewMonth(value.start.getMonth())
    }
    setOpen(true)
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  function handleDayClick(day: Date) {
    const d = startOfDay(day)
    if (!selecting) {
      // First click → start selection
      setSelecting(d)
      setDraft(null)
    } else {
      // Second click → complete range
      const start = selecting <= d ? selecting : d
      const end = selecting <= d ? d : selecting
      setDraft({ start, end })
      setSelecting(null)
    }
  }

  function applyPreset(preset: 'week' | 'month' | 'year') {
    const today = startOfDay(new Date())
    let start: Date
    if (preset === 'week') {
      start = new Date(today)
      start.setDate(today.getDate() - 7)
    } else if (preset === 'month') {
      start = new Date(today)
      start.setMonth(today.getMonth() - 1)
    } else {
      start = new Date(today)
      start.setFullYear(today.getFullYear() - 1)
    }
    setDraft({ start, end: today })
    setSelecting(null)
    setViewYear(start.getFullYear())
    setViewMonth(start.getMonth())
  }

  function handleApply() {
    if (draft) onChange(draft)
    setOpen(false)
  }

  function handleCancel() {
    setDraft(value ?? null)
    setSelecting(null)
    setOpen(false)
  }

  const displayLabel = value
    ? `${formatDate(value.start)} – ${formatDate(value.end)}`
    : placeholder

  const activeDraft = draft
  const activeSelecting = selecting

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={openPicker}
        className={clsx(
          'inline-flex items-center gap-2 h-10 px-3.5 rounded-lg border text-sm font-medium',
          'border-gray-300 bg-white text-gray-700 shadow-xs hover:bg-gray-50',
          open && 'ring-2 ring-violet-600 border-violet-600',
        )}
      >
        <Calendar className="size-4 text-gray-500 shrink-0" />
        <span className={clsx(!value && 'text-gray-400')}>{displayLabel}</span>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute top-full mt-2 right-0 z-[9999] w-[328px] bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
          {/* Date inputs */}
          <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-gray-100">
            <div className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 bg-white min-h-[36px] flex items-center">
              {activeDraft?.start
                ? formatDate(activeDraft.start)
                : activeSelecting
                  ? formatDate(activeSelecting)
                  : <span className="text-gray-400">Start date</span>}
            </div>
            <span className="text-gray-400 text-sm">–</span>
            <div className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 bg-white min-h-[36px] flex items-center">
              {activeDraft?.end
                ? formatDate(activeDraft.end)
                : <span className="text-gray-400">End date</span>}
            </div>
          </div>

          {/* Presets */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
            {(['week', 'month', 'year'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className="text-sm font-semibold text-violet-700 hover:text-violet-800"
              >
                {p === 'week' ? 'Last week' : p === 'month' ? 'Last month' : 'Last year'}
              </button>
            ))}
          </div>

          {/* Month navigation */}
          <div className="flex items-center justify-between px-4 py-3">
            <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-gray-100 text-gray-500">
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-semibold text-gray-900">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-gray-100 text-gray-500">
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Calendar */}
          <div className="px-4 pb-3">
            <Calendar2
              viewYear={viewYear}
              viewMonth={viewMonth}
              selecting={activeSelecting}
              confirmed={activeDraft}
              hover={hover}
              onDayClick={handleDayClick}
              onDayHover={setHover}
            />
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-4 py-3 border-t border-gray-100">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 h-9 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!activeDraft}
              className="flex-1 h-9 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
