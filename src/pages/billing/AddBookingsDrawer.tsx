import { useState, useEffect, useCallback, useMemo } from 'react'
import { clsx } from 'clsx'
import { AlertCircle } from 'lucide-react'
import Drawer from '../../components/ui/Drawer'
import { supabase } from '../../lib/supabase'
import { formatINR } from '../../lib/money'
import { bookingAmount } from '../../lib/invoice'
import type { BookingBlock } from './invoiceTypes'

// Picks the bookings an invoice covers. Only shows bookings belonging to the
// selected customer that are not already on this or any other invoice —
// billing the same duty twice is the failure mode worth spending a query on.

interface Props {
  open: boolean
  onClose: () => void
  customerName: string
  /** Already on the invoice being edited; excluded from the list. */
  excludeBookingIds: number[]
  onAdd: (blocks: BookingBlock[]) => void
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function AddBookingsDrawer({
  open, onClose, customerName, excludeBookingIds, onAdd,
}: Props) {
  const [candidates, setCandidates] = useState<BookingBlock[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())

  // The prop is a fresh array on every parent render; depending on it directly
  // would rebuild fetchCandidates each time and re-fire the effect forever.
  const excludeKey = excludeBookingIds.join(',')
  const excluded = useMemo(
    () => new Set(excludeKey ? excludeKey.split(',').map(Number) : []),
    [excludeKey],
  )

  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    setError(null)

    // Bookings already billed anywhere. RLS scopes invoice_bookings through
    // its parent invoice, so this only ever sees the active company.
    const { data: billed, error: billedErr } = await supabase
      .from('invoice_bookings')
      .select('booking_id')
    if (billedErr) {
      setError(billedErr.message)
      setLoading(false)
      return
    }
    const billedIds = new Set<number>((billed ?? []).map((b: any) => b.booking_id))

    const { data, error: err } = await supabase
      .from('bookings')
      .select('id, booking_ref, start_date, end_date, status, duties(id, start_date, duty_type, base_rate, vehicles(model_name, vehicle_number))')
      .eq('customer_name', customerName)
      .neq('status', 'Cancelled')
      .order('start_date', { ascending: false })

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    setCandidates((data ?? [])
      .filter((b: any) => !billedIds.has(b.id) && !excluded.has(b.id))
      .map((b: any) => ({
        bookingId: b.id,
        bookingRef: b.booking_ref || `#${b.id}`,
        dateRange: `${formatDate(b.start_date)} to ${formatDate(b.end_date)}`,
        customDescription: '',
        duties: (b.duties ?? []).map((d: any) => ({
          id: d.id,
          date: formatDate(d.start_date),
          vehicle: d.vehicles?.model_name ?? '—',
          plate: d.vehicles?.vehicle_number ?? '',
          dutyType: d.duty_type ?? '—',
          baseRate: d.base_rate == null ? null : Number(d.base_rate),
        })),
      })))
    setLoading(false)
  }, [customerName, excluded])

  useEffect(() => {
    if (!open) return
    setPicked(new Set())
    fetchCandidates()
  }, [open, fetchCandidates])

  function toggle(id: number) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleAdd() {
    onAdd(candidates.filter(c => picked.has(c.bookingId)))
    onClose()
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add bookings"
      description={`Uninvoiced bookings for ${customerName}`}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-3.5 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="button" onClick={handleAdd} disabled={picked.size === 0}
            className="px-3.5 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
            {picked.size === 0
              ? 'Add bookings'
              : `Add ${picked.size} booking${picked.size === 1 ? '' : 's'}`}
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-3" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[88px] rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center" aria-live="polite">
          <AlertCircle className="size-8 text-red-500" strokeWidth={1.75} />
          <p className="text-base font-semibold text-gray-900">Couldn't load bookings.</p>
          <p className="text-sm text-gray-500">Something went wrong on our end. Your data is safe.</p>
          <button type="button" onClick={fetchCandidates}
            className="px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors cursor-pointer">
            Retry
          </button>
          <details className="w-full">
            <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">Technical details</summary>
            <pre className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs font-mono text-gray-600 whitespace-pre-wrap">{error}</pre>
          </details>
        </div>
      ) : candidates.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-base font-semibold text-gray-900">No uninvoiced bookings</p>
          <p className="mt-1 text-sm text-gray-500">
            Every booking for {customerName} is already on an invoice.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {candidates.map(b => {
            const isPicked = picked.has(b.bookingId)
            return (
              <label key={b.bookingId}
                className={clsx(
                  'flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors',
                  isPicked ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-white hover:bg-gray-50',
                )}
              >
                <input type="checkbox" checked={isPicked} onChange={() => toggle(b.bookingId)}
                  className="mt-0.5 size-4 rounded border-gray-300 accent-violet-600 cursor-pointer shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Booking ID {b.bookingRef}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{b.dateRange}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {b.duties.length} {b.duties.length === 1 ? 'duty' : 'duties'}
                    {' · '}
                    <span className="font-medium text-gray-700">{formatINR(bookingAmount(b.duties))}</span>
                  </p>
                </div>
              </label>
            )
          })}
        </div>
      )}
    </Drawer>
  )
}
