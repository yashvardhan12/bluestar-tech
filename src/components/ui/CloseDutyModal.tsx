import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Camera, Info, Phone, X } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { formatDate, formatTime } from '../../lib/dutyTime'
import { hhmm, kmTotals, packageMins, timeTotals } from '../../lib/dutySlip'
import { syncBookingStatus } from '../../lib/bookingStatus'
import { syncDutyAllowances } from '../../lib/dutyAllowances'
import {
  buildClosePayload, captureState, closeDefaults, hasErrors, validateClose,
  type CloseDraft, type DutyCaptureFacts,
} from '../../lib/dutyClose'

/**
 * FR-59 — the operator closes a duty the driver did not.
 *
 * This is a transcription surface, not a review screen: an operator on the
 * phone to a driver, or holding a paper slip. Field order follows the way a
 * driver narrates a trip, the driver's number is one tap away, and the absence
 * of a photograph or signature is the expected condition rather than an error.
 *
 * Closing is not correcting. Anything the driver captured renders locked —
 * changing it is FR-56 and belongs on the duty slip beside its evidence. If one
 * gesture did both, no record would carry a provenance worth trusting, and
 * FR-57 makes the passenger signature the authority.
 */

interface Props {
  dutyId: number
  onClose: () => void
  onSaved?: () => void
}

interface Context {
  bookingId: number
  dutyRef: string
  customer: string
  driverName: string | null
  driverPhone: string | null
  driverHasLogin: boolean
  vehicle: string | null
  dutyType: string | null
  thresholdKm: number | null
  startOdoPhoto: string | null
  pickedUpAt: string | null
  expenses: { id: number; type: string; amount: number }[]
}

const INPUT =
  'h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 tabular-nums ' +
  'shadow-xs focus:outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100'

function Label({ children }: { children: React.ReactNode }) {
  return <span className="w-[92px] shrink-0 text-sm text-gray-700">{children}</span>
}

function Legend({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
      {children}
      {note && <span className="ml-2 normal-case tracking-normal font-normal text-gray-400">{note}</span>}
    </p>
  )
}

export default function CloseDutyModal({ dutyId, onClose, onSaved }: Props) {
  const { session } = useAuth()
  const [facts, setFacts] = useState<DutyCaptureFacts | null>(null)
  const [ctx, setCtx] = useState<Context | null>(null)
  const [draft, setDraft] = useState<CloseDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  useEffect(() => {
    let cancelled = false

    async function load() {
      // createClient<any>, so an embedded relation types as an array however the
      // query is written — every page here casts rather than fight it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: d } = await (supabase as any)
        .from('duties')
        .select(`
          id, booking_id, status, start_date, end_date, reporting_time, est_drop_time,
          duty_type, started_at, start_odo, start_odo_photo, picked_up_at,
          closed_at, end_odo, no_show_reason,
          bookings ( booking_ref, customer_name ),
          vehicles ( model_name, vehicle_number ),
          drivers  ( name, phone, auth_user_id )
        `)
        .eq('id', dutyId)
        .single()

      if (cancelled || !d) return

      const [{ data: dutyType }, { data: exp }, { data: siblings }] = await Promise.all([
        supabase.from('duty_types').select('threshold_km').eq('type_name', d.duty_type ?? '').maybeSingle(),
        supabase.from('driver_expense_logs').select('id, type, amount').eq('duty_id', dutyId).order('created_at'),
        supabase.from('duties').select('id').eq('booking_id', d.booking_id).order('id'),
      ])
      if (cancelled) return

      const pos = (siblings ?? []).findIndex((s: { id: number }) => s.id === d.id) + 1
      const next: DutyCaptureFacts = {
        status:        d.status,
        startDate:     d.start_date,
        endDate:       d.end_date,
        reportingTime: d.reporting_time,
        estDropTime:   d.est_drop_time,
        startedAt:     d.started_at,
        startOdo:      d.start_odo == null ? null : Number(d.start_odo),
        closedAt:      d.closed_at,
        endOdo:        d.end_odo == null ? null : Number(d.end_odo),
        noShowReason:  d.no_show_reason,
      }

      setFacts(next)
      setDraft(closeDefaults(next))
      setCtx({
        bookingId:      d.booking_id,
        dutyRef:        d.bookings?.booking_ref ? `${d.bookings.booking_ref}-${pos || 1}` : String(d.id),
        customer:       d.bookings?.customer_name ?? '—',
        driverName:     d.drivers?.name ?? null,
        driverPhone:    d.drivers?.phone ?? null,
        driverHasLogin: d.drivers?.auth_user_id != null,
        vehicle:        d.vehicles ? `${d.vehicles.model_name} · ${d.vehicles.vehicle_number}` : null,
        dutyType:       d.duty_type,
        thresholdKm:    dutyType?.threshold_km == null ? null : Number(dutyType.threshold_km),
        startOdoPhoto:  d.start_odo_photo,
        pickedUpAt:     d.picked_up_at,
        expenses:       (exp ?? []).map((r: { id: number; type: string; amount: number }) => ({
          id: r.id, type: r.type, amount: Number(r.amount),
        })),
      })
    }

    load()
    return () => { cancelled = true }
  }, [dutyId])

  const errors = useMemo(
    () => (facts && draft ? validateClose(facts, draft) : {}),
    [facts, draft],
  )

  /** Live consequence preview. Distance and duration only — this is the sanity
   *  check the operator reads back down the phone. Allowance quantities need
   *  the whole rate card and are recomputed on save instead. */
  const preview = useMemo(() => {
    if (!facts || !draft || !ctx) return null
    const startOdo = facts.startedAt ? facts.startOdo : (draft.startOdoUnknown ? null : Number(draft.startOdo) || null)
    const endOdo = draft.endOdoUnknown ? null : Number(draft.endOdo) || null
    const km = errors.endOdo || errors.startOdo || errors.totalKm
      ? { total: null, extra: null }
      : kmTotals(startOdo, endOdo, ctx.thresholdKm, Number(draft.totalKm) || null)

    let time: ReturnType<typeof timeTotals> = { total: null, extra: null }
    if (!errors.startTime && !errors.closeTime && draft.closeTime) {
      const payload = buildClosePayload(facts, draft, null)
      const startedAt = facts.startedAt ?? payload.started_at
      time = timeTotals(startedAt, payload.closed_at,
        packageMins(facts.startDate, facts.reportingTime, facts.endDate, facts.estDropTime))
    }
    return { km, time }
  }, [facts, draft, ctx, errors])

  async function save() {
    if (!facts || !draft || hasErrors(errors)) return
    setSaving(true)
    setFailed('')

    const { error } = await supabase
      .from('duties')
      .update(buildClosePayload(facts, draft, session?.user?.id ?? null))
      .eq('id', dutyId)

    if (error) {
      console.error('[closeDuty]', error.message)
      setSaving(false)
      setFailed('Could not close the duty. Check the readings and try again.')
      return
    }

    // Both already exist. The second is easy to forget: allowance lines were
    // computed while closed_at was null, so every overtime quantity is sitting
    // at zero until something re-syncs them.
    if (ctx) await syncBookingStatus(ctx.bookingId)
    await syncDutyAllowances(dutyId)

    setSaving(false)
    onSaved?.()
    onClose()
  }

  const state = facts ? captureState(facts) : 'blank'
  const locked = facts?.startedAt != null
  const blocked = hasErrors(errors)

  // FR-59's gate was dropped deliberately: the operator keeps an unconditional
  // path to close. Where a driver could still do it themselves, say so — a
  // notice, never a block.
  const driverCouldClose = ctx?.driverHasLogin && state === 'started'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-gray-950/70 backdrop-blur-sm" onClick={() => !saving && onClose()} />

      <div className="relative flex max-h-[88vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl bg-white shadow-xl">

        <div className="relative shrink-0 px-6 pt-6 pb-4">
          <p className="text-lg font-semibold leading-7 text-gray-900">Close duty</p>
          <p className="mt-1 text-sm leading-5 text-gray-500">
            {ctx ? `${ctx.dutyRef} · ${ctx.customer} · ${formatDate(facts!.startDate)}` : 'Loading…'}
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        {!facts || !draft || !ctx ? (
          <p className="px-6 py-16 text-center text-sm text-gray-400">Loading duty…</p>
        ) : (
          <div className="flex flex-col gap-5 overflow-y-auto px-6 pb-6 [&>*]:shrink-0">
            {/* [&>*]:shrink-0 — the bordered cards below are overflow-hidden, which gives
                them an automatic min-height of 0, so this column would squash and clip
                them instead of scrolling. */}

            {/* ── context: who to call, what ran ── */}
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <div className="flex h-10 items-center bg-gray-50 px-4">
                <span className="w-1/2 text-sm font-medium text-gray-900">Driver</span>
                <span className="flex flex-1 items-center justify-end gap-2.5 text-sm text-gray-500">
                  {ctx.driverName ?? 'Not assigned'}
                  {ctx.driverPhone && (
                    <a
                      href={`tel:${ctx.driverPhone}`}
                      className="inline-flex h-6 items-center gap-1.5 rounded-md bg-violet-50 px-2 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                    >
                      <Phone className="size-3" strokeWidth={1.75} />
                      {ctx.driverPhone}
                    </a>
                  )}
                </span>
              </div>
              {ctx.vehicle && (
                <div className="flex h-10 items-center border-t border-gray-200 px-4">
                  <span className="w-1/2 text-sm font-medium text-gray-900">Vehicle</span>
                  <span className="flex-1 text-right text-sm text-gray-500">{ctx.vehicle}</span>
                </div>
              )}
              <div className="flex h-10 items-center border-t border-gray-200 bg-gray-50 px-4">
                <span className="w-1/2 text-sm font-medium text-gray-900">Planned window</span>
                <span className="flex-1 text-right text-sm text-gray-500">
                  {formatTime(facts.reportingTime)} → {formatTime(facts.estDropTime)}
                  {facts.endDate !== facts.startDate && ` · ${formatDate(facts.endDate)}`}
                </span>
              </div>
              {ctx.dutyType && (
                <div className="flex h-10 items-center border-t border-gray-200 px-4">
                  <span className="w-1/2 text-sm font-medium text-gray-900">Duty type</span>
                  <span className="flex-1 text-right text-sm text-gray-500">{ctx.dutyType}</span>
                </div>
              )}
            </div>

            {/* ── what state this arrived in ── */}
            <div className="flex gap-2.5 rounded-lg border border-violet-100 bg-violet-50 px-3.5 py-3 text-sm leading-5 text-gray-700">
              <Info className="mt-px size-4 shrink-0 text-violet-600" strokeWidth={1.75} />
              <span>
                {locked ? (
                  <>
                    <span className="font-semibold text-violet-700">
                      {ctx.driverName ?? 'The driver'} started this duty at{' '}
                      {new Date(facts.startedAt!).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                    </span>{' '}
                    and did not close it. Ask for the drop time and closing reading.
                  </>
                ) : (
                  <>
                    Nothing was recorded in the driver app
                    {ctx.driverName && !ctx.driverHasLogin && (
                      <> — <span className="font-semibold text-violet-700">{ctx.driverName} has no app login</span></>
                    )}
                    . Enter what {ctx.driverName ? 'they report' : 'was reported'}.
                  </>
                )}
              </span>
            </div>

            {driverCouldClose && (
              <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm leading-5 text-amber-700">
                <AlertTriangle className="mt-px size-4 shrink-0" strokeWidth={1.75} />
                <span>
                  <b className="font-semibold">{ctx.driverName} can still close this from the app.</b>{' '}
                  Closing it here records your figures instead, with no photograph or signature.
                </span>
              </div>
            )}

            {/* ── the driver's half, if there is one ── */}
            {locked && (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-25">
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                    From the driver's app
                  </span>
                  <span className="text-xs font-medium text-gray-500">
                    {formatDate(facts.startDate)}
                  </span>
                </div>
                <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-2.5">
                  <span className="w-[92px] shrink-0 text-[13px] text-gray-500">Left garage</span>
                  <span className="text-sm font-medium tabular-nums text-gray-900">
                    {new Date(facts.startedAt!).toLocaleString('en-IN', {
                      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                    })}
                  </span>
                </div>
                {facts.startOdo != null && (
                  <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-2.5">
                    <span className="w-[92px] shrink-0 text-[13px] text-gray-500">Odometer</span>
                    <span className="text-sm font-medium tabular-nums text-gray-900">
                      {facts.startOdo.toLocaleString('en-IN')} km
                    </span>
                    {ctx.startOdoPhoto && (
                      <span className="ml-auto inline-flex h-6 items-center gap-1.5 rounded-md bg-violet-50 px-2 text-xs font-medium text-violet-700">
                        <Camera className="size-3" strokeWidth={1.75} />
                        Photo
                      </span>
                    )}
                  </div>
                )}
                {ctx.pickedUpAt && (
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-[92px] shrink-0 text-[13px] text-gray-500">Pickup</span>
                    <span className="text-sm font-medium tabular-nums text-gray-900">
                      {new Date(ctx.pickedUpAt).toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
                <p className="border-t border-gray-200 px-4 py-2.5 text-xs leading-4 text-gray-500">
                  These are the driver's figures and stay as recorded. Changing one is a
                  correction — make it on the duty slip, where the evidence is.
                </p>
              </div>
            )}

            {/* ── start half, only when the driver did not write it ── */}
            {!locked && (
              <div className="flex flex-col gap-3">
                <Legend>Start</Legend>
                <div className="flex items-center gap-3">
                  <Label>Left garage</Label>
                  <input
                    type="date" value={draft.startDate}
                    onChange={e => setDraft({ ...draft, startDate: e.target.value })}
                    className={clsx(INPUT, 'w-[150px]')}
                  />
                  <input
                    type="time" value={draft.startTime}
                    onChange={e => setDraft({ ...draft, startTime: e.target.value })}
                    aria-invalid={!!errors.startTime}
                    className={clsx(INPUT, 'w-[110px]', errors.startTime && 'border-amber-500 ring-4 ring-amber-50')}
                  />
                  <span className="text-xs text-gray-400">from the booking</span>
                </div>
                {errors.startTime && <p className="ml-[104px] text-xs font-medium text-amber-700">{errors.startTime}</p>}

                <div className="flex items-center gap-3">
                  <Label>Odometer</Label>
                  <div className="relative">
                    <input
                      inputMode="numeric" placeholder="45120"
                      value={draft.startOdo} disabled={draft.startOdoUnknown}
                      onChange={e => setDraft({ ...draft, startOdo: e.target.value.replace(/\D/g, '') })}
                      aria-invalid={!!errors.startOdo}
                      className={clsx(INPUT, 'w-[150px] pr-8', errors.startOdo && 'border-amber-500 ring-4 ring-amber-50',
                        draft.startOdoUnknown && 'bg-gray-50 text-gray-400')}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">km</span>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-700">
                    <input
                      type="checkbox" checked={draft.startOdoUnknown}
                      onChange={e => setDraft({ ...draft, startOdoUnknown: e.target.checked, startOdo: '' })}
                      className="size-4 rounded border-gray-300 accent-violet-600"
                    />
                    Not known
                  </label>
                </div>
                {errors.startOdo && <p className="ml-[104px] text-xs font-medium text-amber-700">{errors.startOdo}</p>}
              </div>
            )}

            {/* ── close half ── */}
            <div className="flex flex-col gap-3">
              <Legend note={locked ? "— what you're entering" : undefined}>Close</Legend>
              <div className="flex items-center gap-3">
                <Label>Dropped</Label>
                <input
                  type="date" value={draft.closeDate}
                  onChange={e => setDraft({ ...draft, closeDate: e.target.value })}
                  className={clsx(INPUT, 'w-[150px]')}
                />
                <input
                  type="time" value={draft.closeTime}
                  onChange={e => setDraft({ ...draft, closeTime: e.target.value })}
                  aria-invalid={!!errors.closeTime}
                  className={clsx(INPUT, 'w-[110px]', errors.closeTime && 'border-amber-500 ring-4 ring-amber-50')}
                />
                <span className="text-xs text-gray-400">from the booking</span>
              </div>
              {errors.closeTime && <p className="ml-[104px] text-xs font-medium text-amber-700">{errors.closeTime}</p>}

              <div className="flex items-center gap-3">
                <Label>Odometer</Label>
                <div className="relative">
                  <input
                    inputMode="numeric" placeholder="45262"
                    value={draft.endOdo} disabled={draft.endOdoUnknown}
                    onChange={e => setDraft({ ...draft, endOdo: e.target.value.replace(/\D/g, '') })}
                    aria-invalid={!!errors.endOdo}
                    aria-describedby={errors.endOdo ? 'close-endodo-err' : undefined}
                    className={clsx(INPUT, 'w-[150px] pr-8', errors.endOdo && 'border-amber-500 ring-4 ring-amber-50',
                      draft.endOdoUnknown && 'bg-gray-50 text-gray-400')}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">km</span>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-700">
                  <input
                    type="checkbox" checked={draft.endOdoUnknown}
                    onChange={e => setDraft({ ...draft, endOdoUnknown: e.target.checked, endOdo: '' })}
                    className="size-4 rounded border-gray-300 accent-violet-600"
                  />
                  Not known
                </label>
              </div>
              {errors.endOdo && (
                <p id="close-endodo-err" aria-live="polite" className="ml-[104px] text-xs font-medium text-amber-700">
                  {errors.endOdo}
                </p>
              )}

              {/* The readings only ever served to produce this number. When the
                  driver reports the distance and not the readings, take it. */}
              <div className="flex items-center gap-3">
                <Label>Distance</Label>
                <div className="relative">
                  <input
                    inputMode="numeric" placeholder="142"
                    value={draft.totalKm}
                    onChange={e => setDraft({ ...draft, totalKm: e.target.value.replace(/\D/g, '') })}
                    aria-invalid={!!errors.totalKm}
                    aria-describedby={errors.totalKm ? 'close-totalkm-err' : undefined}
                    className={clsx(INPUT, 'w-[150px] pr-8', errors.totalKm && 'border-amber-500 ring-4 ring-amber-50')}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">km</span>
                </div>
                <span className="text-xs text-gray-400">if the readings are not known</span>
              </div>
              {errors.totalKm && (
                <p id="close-totalkm-err" aria-live="polite" className="ml-[104px] text-xs font-medium text-amber-700">
                  {errors.totalKm}
                </p>
              )}
            </div>

            {/* ── expenses the driver already logged, so they are not re-entered ──
                ponytail: read-only. DutySlipDrawer already owns expense editing;
                a second editor here would be two places to keep in step. */}
            {ctx.expenses.length > 0 && (
              <div className="flex flex-col gap-2">
                <Legend note="— already logged by the driver">Expenses</Legend>
                <div className="rounded-xl border border-gray-200 px-4">
                  {ctx.expenses.map((x, i) => (
                    <div key={x.id} className={clsx('flex items-center py-2.5 text-sm', i > 0 && 'border-t border-gray-100')}>
                      <span className="text-gray-900">{x.type}</span>
                      <span className="ml-auto font-medium tabular-nums text-gray-900">
                        ₹{x.amount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── what these figures do ── */}
            {preview && (
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <p className="border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                  This will bill as
                </p>
                <div className="grid grid-cols-[92px_1fr_auto] items-baseline gap-3 border-b border-gray-100 px-4 py-2.5">
                  <span className="text-[13px] text-gray-500">Distance</span>
                  <span className={clsx('text-sm tabular-nums', preview.km.total == null ? 'text-gray-400' : 'font-medium text-gray-900')}>
                    {preview.km.total == null
                      ? (draft.endOdoUnknown || draft.startOdoUnknown ? 'not recorded' : '—')
                      : `${preview.km.total.toLocaleString('en-IN')} km`}
                  </span>
                  <span className="text-right text-xs tabular-nums text-gray-400">
                    {ctx.thresholdKm == null
                      ? 'no package set'
                      : preview.km.extra == null
                        ? `package ${ctx.thresholdKm} km`
                        : `package ${ctx.thresholdKm} · +${preview.km.extra} extra`}
                  </span>
                </div>
                <div className="grid grid-cols-[92px_1fr_auto] items-baseline gap-3 border-b border-gray-100 px-4 py-2.5">
                  <span className="text-[13px] text-gray-500">Duration</span>
                  <span className={clsx('text-sm tabular-nums', preview.time.total == null ? 'text-gray-400' : 'font-medium text-gray-900')}>
                    {hhmm(preview.time.total)}
                  </span>
                  <span className="text-right text-xs tabular-nums text-gray-400">
                    {preview.time.extra == null ? 'no package set' : `+${hhmm(preview.time.extra)} extra`}
                  </span>
                </div>
                <div className="grid grid-cols-[92px_1fr_auto] items-baseline gap-3 px-4 py-2.5">
                  <span className="text-[13px] text-gray-500">Allowances</span>
                  <span className="text-sm text-gray-400">recalculated on save</span>
                  <span className="text-right text-xs text-gray-400">visible on the duty slip</span>
                </div>
              </div>
            )}

            {(draft.endOdoUnknown || draft.startOdoUnknown) && preview?.km.total == null && (
              <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm leading-5 text-amber-700">
                <AlertTriangle className="mt-px size-4 shrink-0" strokeWidth={1.75} />
                <span>
                  <b className="font-semibold">This duty will invoice at base rate.</b> With
                  neither an odometer pair nor a distance there is no extra-kilometre charge to
                  calculate, and the duty slip will show a dash for distance.
                </span>
              </div>
            )}

            <p className="text-xs leading-[17px] text-gray-500">
              Recorded by you from the driver's report — no odometer photograph, no passenger
              signature. This duty stays distinguishable from one the driver verified.
            </p>

            {failed && <p className="text-sm font-medium text-red-600">{failed}</p>}
          </div>
        )}

        <div className="flex shrink-0 gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button" onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-xs transition-colors hover:bg-gray-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button" onClick={save} disabled={saving || blocked || !facts}
            className="flex-1 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {saving ? 'Closing…' : 'Close duty'}
          </button>
        </div>
      </div>
    </div>
  )
}
