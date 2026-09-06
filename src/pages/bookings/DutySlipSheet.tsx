import { supabase } from '../../lib/supabase'
import { signedUrl } from '../../lib/driver'
import { loadDutyAllowances } from '../../lib/dutyAllowances'
import type { ActiveCompany } from '../../lib/useActiveCompany'
import {
  badges, typeStrip, totalNotes, legRow, plannedWindow, dmy,
  type PrintFacts,
} from '../../lib/dutySlipPrint'

/**
 * One printed duty slip — the document itself, and the query that fills it.
 *
 * Lives apart from the page so a single slip and a whole booking's pack are the
 * same sheet: there is one duty slip in this product, not a printed one and a
 * bulk one that drift apart.
 *
 * Everything type-dependent is derived in `dutySlipPrint.ts` and checked there.
 * This file is layout. No money on the sheet — the reference carries none, and
 * the rate belongs on the invoice.
 */

// Sub-10px type is what a duty slip is set in and the named scale does not go
// there; the surrounding app never uses these sizes.
const LBL = 'block text-[8.5px] font-semibold uppercase tracking-[0.07em] text-gray-900'
const VAL = 'block mt-px font-mono text-[10px] font-medium tabular-nums text-gray-900 break-words'
const VAL_SM = 'block mt-px font-mono text-[9px] tabular-nums text-gray-900 break-words'
const VAL_LG = 'block mt-px font-mono text-[11.5px] font-bold tabular-nums text-gray-900'
const CELL = 'border border-gray-900 px-1.5 py-1 align-top text-left'
const COL = `${CELL} text-center align-middle text-[8px] font-semibold uppercase tracking-[0.05em] leading-tight text-gray-900`
const NOTE = 'block text-[7.5px] uppercase tracking-[0.05em] text-gray-500'
const BLANK = 'block mt-px text-[9px] tracking-[0.04em] text-gray-400'

export interface Slip {
  dutyId: number
  dutyRef: string
  startDate: string
  customer: string
  bookedBy: string
  passenger: string
  vehicle: string
  reg: string
  vehicleGroup: string
  dutyType: string
  driver: string
  driverPhone: string
  driverLicence: string
  billTo: string
  reportingAddress: string
  dropAddress: string
  instruction: string | null
  allowanceLine: string | null
  expenseLine: string | null
  signatureUrl: string | null
  facts: PrintFacts
}

const place = (addr: string | null, city: string | null) =>
  [addr, city].filter(Boolean).join(', ') || '—'

/**
 * Everything one sheet needs, in one call. Reads only — printing a slip must
 * never move anybody's numbers, so allowances are loaded and not synced.
 */
export async function loadSlip(dutyId: number): Promise<Slip | null> {
  // createClient<any>: an embedded relation types as an array however the query
  // is written, so the row is cast rather than fought, as on every page here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: d } = await (supabase as any)
    .from('duties')
    .select(`
      id, booking_id, start_date, end_date, reporting_time, est_drop_time,
      duty_type, vehicle_group, start_odo, end_odo, total_km,
      started_at, closed_at, signature_path, driver_notes, operator_notes,
      from_location, to_location, reporting_address, drop_address,
      bookings ( booking_ref, customer_name, booked_by_name, bill_to,
                 is_airport_booking, booking_passengers ( name, sort_order ) ),
      vehicles ( model_name, vehicle_number ),
      drivers  ( name, phone, driver_license )
    `)
    .eq('id', dutyId)
    .maybeSingle()

  if (!d) return null

  // The duty's position inside its booking is what makes "BK-00021-2" mean
  // something to a customer; the row id alone means nothing to them.
  const [{ data: siblings }, { data: card }, { data: exp }] = await Promise.all([
    supabase.from('duties').select('id').eq('booking_id', d.booking_id).order('id'),
    supabase.from('duty_types').select('category, threshold_km').eq('type_name', d.duty_type ?? '').maybeSingle(),
    supabase.from('driver_expense_logs').select('type, amount').eq('duty_id', dutyId).order('created_at'),
  ])

  const pos = (siblings ?? []).findIndex((s: { id: number }) => s.id === d.id) + 1
  const people = [...(d.bookings?.booking_passengers ?? [])]
    .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
  const extra = Math.max(0, people.length - 1)

  const allowances = await loadDutyAllowances(dutyId)
  const expenses = (exp ?? []) as { type: string; amount: number }[]

  return {
    dutyId,
    dutyRef:  d.bookings?.booking_ref ? `${d.bookings.booking_ref}-${pos || 1}` : String(d.id),
    startDate: d.start_date,
    customer: d.bookings?.customer_name ?? '—',
    bookedBy: d.bookings?.booked_by_name ?? '—',
    passenger: (people[0]?.name ?? '—') + (extra > 0 ? ` (+${extra})` : ''),
    vehicle:  d.vehicles?.model_name ?? '—',
    reg:      d.vehicles?.vehicle_number ?? '—',
    vehicleGroup: d.vehicle_group ?? '—',
    dutyType: d.duty_type ?? '—',
    driver:   d.drivers?.name ?? '—',
    driverPhone: d.drivers?.phone ?? '—',
    driverLicence: d.drivers?.driver_license ?? '—',
    billTo:   d.bookings?.bill_to ?? '—',
    reportingAddress: place(d.reporting_address, d.from_location),
    dropAddress:      place(d.drop_address, d.to_location),
    // The driver's own instruction wins: it is the one written for whoever is
    // driving. Operator notes are the fallback, not a second line.
    instruction: d.driver_notes || d.operator_notes || null,
    allowanceLine: allowances.length === 0
      ? null
      : allowances.map(a => `${a.name} — ${a.qty} ${a.unit}${a.qty === 1 ? '' : 's'}`).join('  ·  '),
    expenseLine: expenses.length === 0
      ? null
      : expenses.map(e => `${e.type} ₹${Number(e.amount).toLocaleString('en-IN')}`).join('  ·  '),
    signatureUrl: d.signature_path ? await signedUrl(d.signature_path) : null,
    facts: {
      category: card?.category ?? null,
      isAirportBooking: d.bookings?.is_airport_booking ?? false,
      toLocation: d.to_location,
      startDate: d.start_date,
      endDate:   d.end_date,
      reportingTime: d.reporting_time,
      estDropTime:   d.est_drop_time,
      startedAt: d.started_at,
      closedAt:  d.closed_at,
      startOdo:  d.start_odo == null ? null : Number(d.start_odo),
      endOdo:    d.end_odo   == null ? null : Number(d.end_odo),
      totalKm:   d.total_km  == null ? null : Number(d.total_km),
      thresholdKm: card?.threshold_km == null ? null : Number(card.threshold_km),
    },
  }
}

export default function DutySlipSheet({ slip, company, supplierSignature, signatureRef }: {
  slip: Slip
  company: ActiveCompany | null
  /** A signed URL; `companies.signature_url` stores a path, not a URL. */
  supplierSignature: string | null
  /** So the page can await decode() before printing. */
  signatureRef?: (el: HTMLImageElement | null) => void
}) {
  const { facts } = slip
  const badge = badges(facts)
  const strip = typeStrip(facts)
  const notes = totalNotes(facts)
  const leg = legRow(facts)

  return (
    <div className="slip-sheet mx-auto w-[186mm] bg-white p-[7mm] shadow-lg">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[19%]" /><col className="w-[5%]" /><col className="w-[17%]" />
          <col className="w-[13%]" /><col className="w-[17%]" /><col className="w-[13%]" />
          <col className="w-[8%]" /><col className="w-[8%]" />
        </colgroup>
        <tbody>
          {/* masthead */}
          <tr>
            <td rowSpan={2} className={`${CELL} text-center align-middle`}>
              <div className="text-[17px] font-bold leading-tight tracking-tight text-gray-900">
                {company?.name ?? '—'}
              </div>
              {company?.gstinNumber && (
                <div className="mt-1 font-mono text-[7.5px] tracking-wider text-gray-600">
                  GSTIN {company.gstinNumber}
                </div>
              )}
            </td>
            <td colSpan={5} rowSpan={2} className={`${CELL} align-middle`}>
              <div className="text-center text-[19px] font-bold leading-tight tracking-[0.05em] text-gray-900">
                CAR DUTY SLIP
              </div>
              <div className="mt-0.5 text-center text-[9px] tracking-wide text-gray-700">
                Date of Generation : {dmy(new Date().toISOString().slice(0, 10))}
              </div>
            </td>
            <td colSpan={2} className={`${CELL} text-center align-middle`}>
              <div className="text-[13px] font-bold tracking-[0.12em] text-gray-900">{badge.primary}</div>
            </td>
          </tr>
          <tr>
            <td colSpan={2} className={`${CELL} text-center align-middle`}>
              <div className="text-[11px] font-bold tracking-[0.12em] text-gray-900">{badge.secondary || ' '}</div>
            </td>
          </tr>

          {/* identity */}
          <tr>
            <td className={CELL}><span className={LBL}>Slip No.</span><span className={VAL_LG}>{slip.dutyRef}</span></td>
            <td colSpan={3} className={CELL}><span className={LBL}>Passenger Name</span><span className={VAL}>{slip.passenger}</span></td>
            <td colSpan={2} className={CELL}><span className={LBL}>Booked By</span><span className={VAL}>{slip.bookedBy}</span></td>
            <td colSpan={2} className={CELL}><span className={LBL}>Duty Type</span><span className={VAL_SM}>{slip.dutyType}</span></td>
          </tr>
          <tr>
            <td colSpan={4} className={CELL}>
              <span className={LBL}>Reporting Date &amp; Time</span>
              <span className={VAL}>{plannedWindow(facts)}</span>
            </td>
            <td colSpan={2} className={CELL}><span className={LBL}>Car No. / Type</span><span className={VAL}>{slip.reg} · {slip.vehicleGroup}</span></td>
            <td colSpan={2} className={CELL}><span className={LBL}>Bill To</span><span className={VAL_SM}>{slip.billTo}</span></td>
          </tr>

          {/* leg table header */}
          <tr>
            <td rowSpan={2} className={`${CELL} align-middle`}>
              <span className={VAL_LG}>{slip.vehicle}</span>
              <span className={VAL_SM}>{slip.reg}</span>
            </td>
            <th rowSpan={2} className={COL}>S.N.</th>
            <th rowSpan={2} className={COL}>Rep. Date<br />&amp; Time</th>
            <th rowSpan={2} className={COL}>Opening<br />K.M</th>
            <th rowSpan={2} className={COL}>Rel. Date<br />&amp; Time</th>
            <th rowSpan={2} className={COL}>Closing<br />K.M</th>
            <th colSpan={2} className={`${COL} border-b border-gray-900`}>Total</th>
          </tr>
          <tr><th colSpan={2} className={`${COL} py-0.5`}>K.M &nbsp;/&nbsp; HRS</th></tr>

          {/* the leg */}
          <tr>
            <td className={CELL}>
              <span className={LBL}>Customer</span>
              <span className={`${VAL} mb-1.5`}>{slip.customer}</span>
              <span className={`${LBL} mt-2`}>Reporting Address</span>
              <span className={VAL_SM}>{slip.reportingAddress}</span>
              <span className={`${LBL} mt-2`}>Drop Address</span>
              <span className={VAL_SM}>{slip.dropAddress}</span>
            </td>
            <td className={`${CELL} bg-gray-50 text-center align-middle font-mono text-[10px] font-bold text-gray-900`}>1</td>
            <td className={`${CELL} h-[30px] bg-gray-50 align-middle`}><span className={VAL}>{leg.rep}</span></td>
            <td className={`${CELL} bg-gray-50 align-middle`}><span className={VAL}>{leg.open}</span></td>
            <td className={`${CELL} bg-gray-50 align-middle`}><span className={VAL}>{leg.rel}</span></td>
            <td className={`${CELL} bg-gray-50 align-middle`}><span className={VAL}>{leg.close}</span></td>
            <td colSpan={2} className={`${CELL} bg-gray-50 align-middle`}><span className={VAL}>{leg.combined}</span></td>
          </tr>

          {/* the one row that changes with the duty type */}
          <tr>
            <td colSpan={8} className={`${CELL} bg-gray-50`}>
              {strip.map(s => (
                <span key={s.label} className="mr-7 inline-block align-top last:mr-0">
                  <span className={LBL}>{s.label}</span>
                  <span className={VAL_SM}>{s.value}</span>
                </span>
              ))}
            </td>
          </tr>

          {/* driver + totals */}
          <tr>
            <td rowSpan={2} className={CELL}>
              <span className={LBL}>Instruction for Driver</span>
              {slip.instruction
                ? <span className={VAL_SM}>{slip.instruction}</span>
                : <span className={BLANK}>— none recorded on this duty —</span>}
            </td>
            <td colSpan={3} className={CELL}><span className={LBL}>Driver</span><span className={VAL}>{slip.driver}</span></td>
            <td colSpan={2} className={CELL}><span className={LBL}>Mobile No.</span><span className={VAL}>{slip.driverPhone}</span></td>
            <td colSpan={2} className={`${CELL} align-middle`}>
              <span className={LBL}>Total K.M</span>
              <span className={VAL_LG}>{leg.totalKm}</span>
              {notes.km && <span className={NOTE}>{notes.km}</span>}
            </td>
          </tr>
          <tr>
            <td colSpan={3} className={CELL}><span className={LBL}>Licence No.</span><span className={VAL_SM}>{slip.driverLicence}</span></td>
            <td colSpan={2} className={CELL}><span className={LBL}>Vehicle Group</span><span className={VAL_SM}>{slip.vehicleGroup}</span></td>
            <td colSpan={2} className={`${CELL} align-middle`}>
              <span className={LBL}>Total Hrs</span>
              <span className={VAL_LG}>{leg.totalHrs}</span>
              {notes.hrs && <span className={NOTE}>{notes.hrs}</span>}
            </td>
          </tr>

          {/* claims */}
          <tr>
            <td colSpan={4} className={CELL}>
              <span className={LBL}>Allowances Claimed</span>
              {slip.allowanceLine
                ? <span className={VAL_SM}>{slip.allowanceLine}</span>
                : <span className={BLANK}>— none —</span>}
            </td>
            <td colSpan={2} className={CELL}>
              <span className={LBL}>Additional Expenses</span>
              {slip.expenseLine
                ? <span className={VAL_SM}>{slip.expenseLine}</span>
                : <span className={BLANK}>— none recorded —</span>}
            </td>
            <td colSpan={2} className={CELL}>
              <span className={LBL}>Garage In / Out</span>
              <span className={BLANK}>— to be added —</span>
            </td>
          </tr>

          {/* signatures */}
          <tr>
            <td colSpan={3} className={`${CELL} h-[62px]`}>
              <span className={LBL}>Passenger Signature</span>
              {slip.signatureUrl
                ? <>
                    <img
                      ref={signatureRef}
                      src={slip.signatureUrl}
                      alt="Passenger signature captured at close of duty"
                      className="block h-[34px] w-auto max-w-full"
                    />
                    <span className={NOTE}>Captured at close · driver app</span>
                  </>
                : <span className={BLANK}>— not captured —</span>}
            </td>
            <td colSpan={3} className={CELL}>
              <span className={LBL}>Sign. of Car Supplier</span>
              {supplierSignature && (
                <img
                  src={supplierSignature}
                  alt={`Authorised signature for ${company?.name ?? 'the operator'}`}
                  className="block h-[34px] w-auto max-w-full"
                />
              )}
            </td>
            <td colSpan={2} className={CELL}><span className={LBL}>For {company?.name ?? '—'}</span></td>
          </tr>

          {/* terms */}
          <tr>
            <td className={CELL}><span className={LBL}>Note :</span></td>
            <td colSpan={7} className={CELL}>
              {company?.dutySlipTerms
                ? <div className="whitespace-pre-line text-[8.5px] leading-relaxed tracking-[0.02em] text-gray-900">{company.dutySlipTerms}</div>
                : <div className={BLANK}>— no duty slip terms set · Settings → Company —</div>}
            </td>
          </tr>

          <tr>
            <td colSpan={8} className="border-0 pt-1.5">
              <div className="text-center text-[8px] tracking-[0.05em] text-gray-500">
                {[company?.name, company?.address?.replace(/\n/g, ', '), company?.phoneNumber]
                  .filter(Boolean).join(' · ')}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
