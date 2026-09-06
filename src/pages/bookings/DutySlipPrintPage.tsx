import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { signedUrl } from '../../lib/driver'
import { useActiveCompany } from '../../lib/useActiveCompany'
import DutySlipSheet, { loadSlip, type Slip } from './DutySlipSheet'

/**
 * The printed duty slip, for one duty or for a whole booking.
 *
 *   /duties/:dutyId/slip                  one sheet
 *   /bookings/:bookingId/slips            every closed duty in the booking
 *   /bookings/:bookingId/slips?duties=…   only the duties named, in run order
 *
 * One component for both, because they are one document: the pack is the same
 * sheet repeated with a page break, so the two can never drift apart. The
 * browser writes the PDF from the print dialog — the same mechanism the invoice
 * already uses, and no library.
 *
 * Rendered outside AppShell: a sidebar has no business on a document.
 */

/** A duty with no `closed_at` has no readings, no timestamps and no signature,
 *  so its sheet would print empty. Left out of the pack, and counted, because
 *  silently dropping duties from a customer's record is worse than a blank. */
const SKIPPED_NOTE = (n: number) =>
  `${n} ${n === 1 ? 'duty still needs' : 'duties still need'} closing and ${n === 1 ? 'was' : 'were'} left out.`

export default function DutySlipPrintPage() {
  const { dutyId, bookingId } = useParams()
  const [params] = useSearchParams()
  const company = useActiveCompany()

  // A selection from the booking's duty list. Filtered against the booking's
  // own duties rather than trusted: a hand-edited id would otherwise print a
  // slip from another booking, and RLS would happily allow it within a company.
  const picked = params.get('duties')

  const [slips, setSlips] = useState<Slip[]>([])
  const [skipped, setSkipped] = useState(0)
  const [supplierSig, setSupplierSig] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const sigRefs = useRef<HTMLImageElement[]>([])
  const printed = useRef(false)

  useEffect(() => {
    let cancelled = false
    sigRefs.current = []

    async function load() {
      setLoading(true)

      let ids: number[] = []

      if (bookingId != null) {
        // Closed duties only, in the order they ran — a pack that jumps about
        // in time is unreadable next to an invoice.
        const { data, error: err } = await supabase
          .from('duties')
          .select('id, closed_at, status')
          .eq('booking_id', Number(bookingId))
          .neq('status', 'Cancelled')
          .order('start_date')
          .order('id')

        if (cancelled) return
        if (err) { setError(err.message); setLoading(false); return }

        let rows = data ?? []
        if (picked) {
          const wanted = new Set(picked.split(',').map(Number).filter(Number.isFinite))
          rows = rows.filter(r => wanted.has(r.id))
        }
        ids = rows.filter(r => r.closed_at != null).map(r => r.id)
        setSkipped(rows.length - ids.length)

        if (ids.length === 0) {
          setError(picked
            ? 'None of the duties you selected has been closed yet, so there is nothing to print.'
            : 'No duty on this booking has been closed yet, so there is nothing to print.')
          setLoading(false)
          return
        }
      } else {
        const id = Number(dutyId)
        if (!Number.isFinite(id)) { setError('Not a duty id.'); setLoading(false); return }
        ids = [id]
      }

      const loaded = (await Promise.all(ids.map(loadSlip))).filter((s): s is Slip => s != null)
      if (cancelled) return

      if (loaded.length === 0) {
        setError('That duty does not exist, or is not yours to see.')
        setLoading(false)
        return
      }

      setSlips(loaded)
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [dutyId, bookingId, picked])

  // companies.signature_url stores an object PATH in the same private bucket
  // FileUpload writes to, so it needs signing exactly like a duty signature.
  useEffect(() => {
    let cancelled = false
    const path = company?.signatureUrl
    if (!path) { setSupplierSig(null); return }
    signedUrl(path).then(u => { if (!cancelled) setSupplierSig(u) })
    return () => { cancelled = true }
  }, [company?.signatureUrl])

  // Every signature is a short-lived signed URL. Print before they have decoded
  // and the PDF comes out with empty signature boxes, so wait for the pixels —
  // all of them, since one page of a pack is as wrong as one slip.
  useEffect(() => {
    if (loading || error || slips.length === 0 || printed.current) return
    printed.current = true
    let cancelled = false

    async function go() {
      await Promise.all(
        sigRefs.current.filter(Boolean).map(img =>
          img.complete ? Promise.resolve() : img.decode().catch(() => {}),
        ),
      )
      if (!cancelled) window.print()
    }
    // One frame, so the sheets are laid out before the dialog freezes them.
    const raf = requestAnimationFrame(() => { void go() })
    return () => { cancelled = true; cancelAnimationFrame(raf) }
  }, [loading, error, slips.length])

  if (loading) return <Centered>Loading duty {slips.length > 1 ? 'slips' : 'slip'}…</Centered>
  if (error || slips.length === 0) return <Centered>{error ?? 'Duty slip unavailable.'}</Centered>

  const many = slips.length > 1
  const heading = many
    ? `${slips.length} duty slips · ${slips[0].customer}`
    : `Duty slip ${slips[0].dutyRef} · ${slips[0].customer}`

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          .slip-toolbar { display: none !important; }
          .slip-sheet { box-shadow: none; width: auto; min-width: 0; padding: 0; }
          /* One duty, one page. break-after on the last sheet would emit a
             trailing blank page, so the gap goes between them. */
          .slip-page + .slip-page { break-before: page; }
          body { background: #fff; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-100 py-8">
        <div className="slip-toolbar mx-auto mb-6 flex max-w-[210mm] items-center justify-between gap-4 px-4">
          <div>
            <p className="text-sm text-gray-700">{heading}</p>
            {skipped > 0 && (
              <p className="mt-0.5 text-sm text-warning-700">{SKIPPED_NOTE(skipped)}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="shrink-0 rounded-lg bg-violet-600 px-3.5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 cursor-pointer"
          >
            Print
          </button>
        </div>

        <div className="flex flex-col gap-8">
          {slips.map((slip, i) => (
            <div key={slip.dutyId} className="slip-page">
              <DutySlipSheet
                slip={slip}
                company={company}
                supplierSignature={supplierSig}
                signatureRef={el => { if (el) sigRefs.current[i] = el }}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-6">
      <p className="max-w-md text-center text-sm text-gray-500">{children}</p>
    </div>
  )
}
