import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, Camera, ChevronRight, MapPin, Phone, Plus, Trash2, X,
} from 'lucide-react'
import { clsx } from 'clsx'
import SignaturePad from '../../components/ui/SignaturePad'
import { useDriverDuties } from './DriverApp'
import {
  addExpense, captureEvidence, closeDuty, deleteExpense, dutyStage, dutyStart,
  dutyDeparturePrompt, duration, EXPENSE_TYPES, formatDate, formatTime,
  loadExpenses, loadPassengers, markNoShow, markPickup, mapsUrl, startDuty,
  STAGE_LABEL,
  type DriverDuty, type DriverExpense, type Passenger,
} from '../../lib/driver'

/**
 * F3 + F4. The duty in the driver's hand.
 *
 * The lifecycle is a fixed forward sequence and nothing here branches: start →
 * pickup → close, with no-show as the one exit before pickup. Every step that
 * captures billing evidence blocks until the evidence is actually uploaded,
 * because a duty closed with a lost photograph is worse than one not closed.
 */

// FR-32. Far enough outside the garage-start allowance that a legitimately
// early start passes unchallenged.
const EARLY_START_HOURS = 2

// ── bottom sheet ─────────────────────────────────────────────────────────────
// A modal panel that comes up from the bottom, because that is where the thumb
// is. `Drawer` is a 480px right-hand panel built for the operator desktop.

function Sheet({ open, title, onClose, children }: {
  open: boolean; title: string; onClose: () => void; children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-gray-950/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[92dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 flex items-center justify-between gap-4 bg-white px-5 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 text-gray-400 cursor-pointer">
            <X className="size-6" strokeWidth={1.75} />
          </button>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  )
}

function Primary({ children, onClick, disabled, tone = 'accent' }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: 'accent' | 'danger'
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'w-full h-14 rounded-xl text-base font-semibold text-white transition-colors disabled:opacity-40 cursor-pointer',
        tone === 'accent' ? 'bg-violet-600 active:bg-violet-700' : 'bg-error-600 active:bg-error-700',
      )}
    >
      {children}
    </button>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  )
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4">
      {title && <h2 className="text-sm font-semibold text-gray-500 mb-2">{title}</h2>}
      {children}
    </section>
  )
}

// ── photo capture ────────────────────────────────────────────────────────────
// `capture="environment"` opens the rear camera straight from the file input.
// No camera library, no permissions dance, and it still falls back to the
// gallery on a device that has no camera.

function PhotoField({ label, file, onPick }: {
  label: string; file: File | null; onPick: (f: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="w-full flex items-center gap-3 h-14 px-4 rounded-xl border border-gray-300 bg-white text-base font-medium text-gray-900 active:bg-gray-50 cursor-pointer"
      >
        <Camera className="size-5 text-violet-600" strokeWidth={1.75} />
        {file ? 'Retake photo' : label}
      </button>
      {preview && <img src={preview} alt="" className="mt-3 w-full rounded-xl border border-gray-200" />}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }}
      />
    </div>
  )
}

const ODO_INPUT =
  'w-full h-14 px-4 rounded-xl border border-gray-300 text-2xl font-semibold tabular-nums ' +
  'text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-600 focus:border-violet-600'

// ── page ─────────────────────────────────────────────────────────────────────

export default function DriverDutyPage() {
  const { dutyId } = useParams()
  const navigate = useNavigate()
  const { duties, me, loading, reload } = useDriverDuties()
  const duty = duties.find(d => d.id === Number(dutyId))

  const [passengers, setPassengers] = useState<Passenger[]>([])
  const [expenses, setExpenses] = useState<DriverExpense[]>([])
  const [sheet, setSheet] = useState<'start' | 'close' | 'no-show' | 'expense' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!duty) return
    let cancelled = false
    Promise.all([loadPassengers(duty.id), loadExpenses(duty.id)]).then(([p, e]) => {
      if (cancelled) return
      setPassengers(p)
      setExpenses(e)
    })
    return () => { cancelled = true }
  }, [duty?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <p className="p-6 text-sm text-gray-400">Loading…</p>
  if (!duty) {
    return (
      <div className="p-6">
        <p className="text-base font-medium text-gray-900">Duty not found</p>
        <button onClick={() => navigate('/driver/current')} className="mt-2 text-sm font-medium text-violet-700 cursor-pointer">
          Back to Current
        </button>
      </div>
    )
  }

  const stage = dutyStage(duty)
  const readOnly = stage === 'completed' || stage === 'no-show'  // FR-33
  const prompt = dutyDeparturePrompt(duty)

  async function refreshExpenses() { if (duty) setExpenses(await loadExpenses(duty.id)) }

  async function run(fn: () => Promise<string | null>) {
    setBusy(true)
    setError('')
    const err = await fn()
    setBusy(false)
    if (err) { setError(err); return false }
    setSheet(null)
    await reload()
    return true
  }

  return (
    <div className="pb-40">
      {/* ── header ── */}
      <header className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur px-4 pt-3 pb-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 -ml-1 p-1 text-sm font-medium text-gray-600 cursor-pointer">
          <ArrowLeft className="size-5" strokeWidth={1.75} />
          Back
        </button>
      </header>

      <div className="px-4 flex flex-col gap-3">
        {error && (
          <div role="alert" className="flex gap-2 p-3.5 rounded-xl bg-error-50 border border-error-200 text-sm text-error-700">
            <AlertCircle className="size-5 shrink-0" strokeWidth={1.75} />
            <span>{error}</span>
          </div>
        )}

        {/* ── who and when (FR-12) ── */}
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-gray-900">{duty.customerName}</p>
              {duty.bookedByName && <p className="mt-0.5 text-sm text-gray-500">Booked by {duty.bookedByName}</p>}
            </div>
            <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-sm font-medium text-gray-700">
              {STAGE_LABEL[stage]}
            </span>
          </div>

          <div className="mt-3 border-t border-gray-100 pt-1">
            <Row label="Reporting" value={`${formatDate(duty.startDate)} · ${formatTime(duty.reportingTime)}`} />
            {duty.endDate !== duty.startDate && <Row label="Until" value={formatDate(duty.endDate)} />}
            {duty.dutyType && <Row label="Duty type" value={duty.dutyType} />}
            {duty.vehicleNumber && <Row label="Vehicle" value={`${duty.vehicleNumber}${duty.vehicleModel ? ` · ${duty.vehicleModel}` : ''}`} />}
          </div>

          {/* FR-14 */}
          {prompt && !duty.startedAt && (
            <p className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700">{prompt}</p>
          )}
        </Card>

        {/* ── where (FR-13) ── */}
        <Card title="Route">
          {([['Pickup', duty.fromLocation, duty.reportingAddress],
             ['Drop', duty.toLocation, duty.dropAddress]] as const).map(([label, place, address]) => (
            <div key={label} className="py-2 border-b border-gray-100 last:border-0">
              <p className="text-sm text-gray-500">{label}</p>
              <p className="mt-0.5 text-base font-medium text-gray-900">{place ?? '—'}</p>
              {address && <p className="mt-0.5 text-sm text-gray-600">{address}</p>}
              {(address || place) && (
                <a
                  href={mapsUrl(address || place || '')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 h-11 px-3 -ml-3 text-sm font-semibold text-violet-700"
                >
                  <MapPin className="size-4" strokeWidth={1.75} />
                  Open in Maps
                </a>
              )}
            </div>
          ))}
        </Card>

        {/* ── passengers (FR-12, FR-24) ── */}
        {passengers.length > 0 && (
          <Card title="Passengers">
            {passengers.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
                <span className="text-base text-gray-900 truncate">{p.name}</span>
                {p.phone && (
                  <a
                    href={`tel:${p.phone}`}
                    aria-label={`Call ${p.name}`}
                    className="shrink-0 flex items-center justify-center size-11 rounded-full bg-violet-50 text-violet-700"
                  >
                    <Phone className="size-5" strokeWidth={1.75} />
                  </a>
                )}
              </div>
            ))}
          </Card>
        )}

        {duty.driverNotes && <Card title="Note from operator"><p className="text-base text-gray-900">{duty.driverNotes}</p></Card>}

        {/* ── the duty slip, once it exists (FR-11) ── */}
        {(duty.startOdo != null || duty.startedAt) && (
          <Card title="Duty slip">
            {duty.startedAt && <Row label="Started" value={new Date(duty.startedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} />}
            {duty.closedAt && <Row label="Closed" value={new Date(duty.closedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} />}
            {duty.startOdo != null && <Row label="Start reading" value={<span className="tabular-nums">{duty.startOdo.toLocaleString('en-IN')} km</span>} />}
            {duty.endOdo != null && <Row label="End reading" value={<span className="tabular-nums">{duty.endOdo.toLocaleString('en-IN')} km</span>} />}
            {duty.startOdo != null && duty.endOdo != null && (
              <Row label="Distance" value={<span className="tabular-nums">{(duty.endOdo - duty.startOdo).toLocaleString('en-IN')} km</span>} />
            )}
            {duty.startedAt && duty.closedAt && <Row label="Duration" value={duration(duty.startedAt, duty.closedAt)} />}
            {duty.noShowReason && <Row label="No show" value={duty.noShowReason} />}
          </Card>
        )}

        {/* ── expenses (F4) ── */}
        <Card title="Expenses">
          {expenses.length === 0
            ? <p className="py-1 text-sm text-gray-500">Nothing recorded. Add tolls and parking as you pay them.</p>
            : (
              <>
                {expenses.map(x => (
                  <div key={x.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100">
                    <span className="text-base text-gray-900">{x.type}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-medium text-gray-900 tabular-nums">₹{x.amount.toLocaleString('en-IN')}</span>
                      {/* FR-38 — removable only until the duty closes. */}
                      {!readOnly && (
                        <button
                          onClick={() => void run(async () => {
                            const err = await deleteExpense(x.id)
                            if (!err) await refreshExpenses()
                            return err
                          })}
                          aria-label={`Remove ${x.type}`}
                          className="p-2 text-gray-400 active:text-error-600 cursor-pointer"
                        >
                          <Trash2 className="size-5" strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {/* FR-37 — it totals visibly. */}
                <div className="flex items-center justify-between pt-2.5">
                  <span className="text-sm font-semibold text-gray-500">Total</span>
                  <span className="text-base font-semibold text-gray-900 tabular-nums">
                    ₹{expenses.reduce((s, x) => s + x.amount, 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </>
            )}

          {!readOnly && duty.startedAt && (
            <button
              onClick={() => setSheet('expense')}
              className="mt-3 w-full flex items-center justify-center gap-2 h-12 rounded-xl border border-gray-300 text-base font-medium text-gray-900 active:bg-gray-50 cursor-pointer"
            >
              <Plus className="size-5" strokeWidth={1.75} />
              Add expense
            </button>
          )}
        </Card>
      </div>

      {/* ── the one action that matters, pinned in the thumb zone (FR-25) ── */}
      {!readOnly && (
        <div className="fixed inset-x-0 bottom-16 z-20 border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-3 flex flex-col gap-2">
          {stage === 'not-started' && <Primary onClick={() => setSheet('start')}>Start duty</Primary>}
          {stage === 'started' && (
            <>
              <Primary onClick={() => void run(() => markPickup(duty.id))} disabled={busy}>
                Confirm pickup
              </Primary>
              <button
                onClick={() => setSheet('no-show')}
                className="h-12 rounded-xl border border-gray-300 text-base font-medium text-gray-700 active:bg-gray-50 cursor-pointer"
              >
                Mark no-show
              </button>
            </>
          )}
          {stage === 'on-board' && <Primary onClick={() => setSheet('close')}>Close duty</Primary>}
        </div>
      )}

      <StartSheet
        open={sheet === 'start'}
        duty={duty}
        companyId={me?.companyId ?? null}
        busy={busy}
        onClose={() => setSheet(null)}
        onSubmit={(odo, path) => run(() => startDuty(duty.id, odo, path))}
        onBusy={setBusy}
        onError={setError}
      />

      <CloseSheet
        open={sheet === 'close'}
        duty={duty}
        companyId={me?.companyId ?? null}
        busy={busy}
        onClose={() => setSheet(null)}
        onSubmit={(odo, photo, sig) => run(() => closeDuty(duty.id, odo, photo, sig))}
        onBusy={setBusy}
        onError={setError}
      />

      <NoShowSheet
        open={sheet === 'no-show'}
        busy={busy}
        onClose={() => setSheet(null)}
        onSubmit={reason => run(() => markNoShow(duty.id, reason))}
      />

      <ExpenseSheet
        open={sheet === 'expense'}
        dutyId={duty.id}
        companyId={me?.companyId ?? null}
        busy={busy}
        onClose={() => setSheet(null)}
        onSaved={async () => { setSheet(null); await refreshExpenses() }}
        onBusy={setBusy}
        onError={setError}
      />
    </div>
  )
}

// ── start (FR-19, FR-32) ─────────────────────────────────────────────────────

function StartSheet({ open, duty, companyId, busy, onClose, onSubmit, onBusy, onError }: {
  open: boolean; duty: DriverDuty; companyId: number | null; busy: boolean
  onClose: () => void
  onSubmit: (odo: number, path: string) => Promise<boolean>
  onBusy: (b: boolean) => void
  onError: (m: string) => void
}) {
  const [odo, setOdo] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [confirmedEarly, setConfirmedEarly] = useState(false)

  const hoursEarly = (dutyStart(duty).getTime() - Date.now()) / 3_600_000
  const tooEarly = hoursEarly > EARLY_START_HOURS && !confirmedEarly

  async function submit() {
    if (!companyId) { onError('Could not identify your company. Sign out and back in.'); return }
    const reading = Number(odo)
    if (!Number.isFinite(reading) || reading <= 0 || !photo) return

    onBusy(true)
    // The upload comes first on purpose: a duty that starts but loses its
    // photograph has no evidence behind the reading it just recorded.
    const path = await captureEvidence(companyId, duty.id, 'start-odo', photo)
    onBusy(false)
    if (!path) { onError('Could not upload the photo. Check your signal and try again.'); return }

    await onSubmit(reading, path)
  }

  return (
    <Sheet open={open} title="Start duty" onClose={onClose}>
      {tooEarly ? (
        <>
          {/* FR-32 — an accidental early start writes a start time into billing. */}
          <p className="text-base text-gray-900">
            This duty reports at {formatTime(duty.reportingTime)} on {formatDate(duty.startDate)} —
            that is {Math.round(hoursEarly)} hours away.
          </p>
          <p className="mt-2 text-sm text-gray-600">Starting now records the time as your actual start.</p>
          <div className="mt-5 flex flex-col gap-2">
            <Primary onClick={() => setConfirmedEarly(true)}>Start it anyway</Primary>
            <button onClick={onClose} className="h-12 text-base font-medium text-gray-700 cursor-pointer">Cancel</button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="start-odo" className="block text-base font-medium text-gray-700 mb-2">
              Odometer reading
            </label>
            <input
              id="start-odo" value={odo} onChange={e => setOdo(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric" placeholder="45120" className={ODO_INPUT}
            />
          </div>
          <PhotoField label="Photograph the odometer" file={photo} onPick={setPhoto} />
          <Primary onClick={() => void submit()} disabled={busy || !odo || !photo}>
            {busy ? 'Saving…' : 'Submit and start'}
          </Primary>
          <p className="text-center text-sm text-gray-500">Both the reading and the photo are required.</p>
        </div>
      )}
    </Sheet>
  )
}

// ── close (FR-26 → FR-29) ────────────────────────────────────────────────────

function CloseSheet({ open, duty, companyId, busy, onClose, onSubmit, onBusy, onError }: {
  open: boolean; duty: DriverDuty; companyId: number | null; busy: boolean
  onClose: () => void
  onSubmit: (odo: number, photo: string, signature: string) => Promise<boolean>
  onBusy: (b: boolean) => void
  onError: (m: string) => void
}) {
  // FR-26 — signature first, while the passenger is still in the car.
  const [step, setStep] = useState<'sign' | 'odo'>('sign')
  const [signature, setSignature] = useState<Blob | null>(null)
  const [odo, setOdo] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)

  const reading = Number(odo)
  // FR-29 is enforced in the database; saying so here saves a round trip and a
  // retype at the roadside.
  const backwards = odo !== '' && duty.startOdo != null && reading <= duty.startOdo

  async function submit() {
    if (!companyId) { onError('Could not identify your company. Sign out and back in.'); return }
    if (!signature || !photo || backwards || !Number.isFinite(reading)) return

    onBusy(true)
    const [sigPath, photoPath] = await Promise.all([
      captureEvidence(companyId, duty.id, 'signature', signature),
      captureEvidence(companyId, duty.id, 'end-odo', photo),
    ])
    onBusy(false)
    if (!sigPath || !photoPath) { onError('Could not upload. Check your signal and try again.'); return }

    await onSubmit(reading, photoPath, sigPath)
  }

  return (
    <Sheet open={open} title={step === 'sign' ? 'Passenger signature' : 'End reading'} onClose={onClose}>
      {step === 'sign' ? (
        <div className="flex flex-col gap-4">
          <p className="text-base text-gray-600">Hand the phone to the passenger.</p>
          <SignaturePad onChange={setSignature} />
          <Primary onClick={() => setStep('odo')} disabled={!signature}>Next</Primary>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {duty.startOdo != null && (
            <p className="text-sm text-gray-600 tabular-nums">
              Started at {duty.startOdo.toLocaleString('en-IN')} km
            </p>
          )}
          <div>
            <label htmlFor="end-odo" className="block text-base font-medium text-gray-700 mb-2">
              Odometer reading
            </label>
            <input
              id="end-odo" value={odo} onChange={e => setOdo(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric" placeholder="45262" className={ODO_INPUT}
            />
            {backwards && (
              <p className="mt-2 text-sm text-error-600">
                Must be more than the start reading of {duty.startOdo?.toLocaleString('en-IN')} km.
              </p>
            )}
          </div>
          <PhotoField label="Photograph the odometer" file={photo} onPick={setPhoto} />
          <Primary onClick={() => void submit()} disabled={busy || !odo || !photo || backwards}>
            {busy ? 'Saving…' : 'Close duty'}
          </Primary>
          <button onClick={() => setStep('sign')} className="h-12 text-base font-medium text-gray-700 cursor-pointer">
            Back to signature
          </button>
        </div>
      )}
    </Sheet>
  )
}

// ── no-show (FR-23) ──────────────────────────────────────────────────────────

function NoShowSheet({ open, busy, onClose, onSubmit }: {
  open: boolean; busy: boolean; onClose: () => void; onSubmit: (reason: string) => Promise<boolean>
}) {
  const [reason, setReason] = useState('')
  const PRESETS = ['Passenger did not arrive', 'Passenger cancelled', 'Wrong address', 'Could not reach passenger']

  return (
    <Sheet open={open} title="Mark no-show" onClose={onClose}>
      <p className="text-base text-gray-600">
        A no-show needs a reason. Without one it cannot be billed or argued.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {PRESETS.map(p => (
          <button
            key={p}
            onClick={() => setReason(p)}
            className={clsx(
              'flex items-center justify-between gap-3 h-14 px-4 rounded-xl border text-left text-base cursor-pointer',
              reason === p ? 'border-violet-600 bg-violet-50 text-violet-900 font-medium' : 'border-gray-300 text-gray-900',
            )}
          >
            {p}
            {reason === p && <ChevronRight className="size-5 shrink-0" strokeWidth={1.75} />}
          </button>
        ))}
        <input
          value={PRESETS.includes(reason) ? '' : reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Or type another reason"
          className="h-14 px-4 rounded-xl border border-gray-300 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-600"
        />
      </div>
      <div className="mt-5">
        <Primary tone="danger" onClick={() => void onSubmit(reason)} disabled={busy || !reason.trim()}>
          {busy ? 'Saving…' : 'Mark no-show'}
        </Primary>
      </div>
    </Sheet>
  )
}

// ── expense (FR-34 → FR-36) ──────────────────────────────────────────────────

function ExpenseSheet({ open, dutyId, companyId, busy, onClose, onSaved, onBusy, onError }: {
  open: boolean; dutyId: number; companyId: number | null; busy: boolean
  onClose: () => void
  onSaved: () => Promise<void>
  onBusy: (b: boolean) => void
  onError: (m: string) => void
}) {
  const [type, setType] = useState<string>(EXPENSE_TYPES[0])
  const [amount, setAmount] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)

  async function save() {
    if (!companyId) { onError('Could not identify your company. Sign out and back in.'); return }
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0 || !receipt) return

    onBusy(true)
    const path = await captureEvidence(companyId, dutyId, 'receipt', receipt)
    if (!path) { onBusy(false); onError('Could not upload the receipt. Try again.'); return }
    const err = await addExpense(dutyId, type, value, path)
    onBusy(false)
    if (err) { onError(err); return }

    setAmount(''); setReceipt(null); setType(EXPENSE_TYPES[0])
    await onSaved()
  }

  return (
    <Sheet open={open} title="Add expense" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <span className="block text-base font-medium text-gray-700 mb-2">Type</span>
          <div className="flex flex-wrap gap-2">
            {EXPENSE_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={clsx(
                  'h-12 px-4 rounded-xl border text-base cursor-pointer',
                  type === t ? 'border-violet-600 bg-violet-50 text-violet-900 font-medium' : 'border-gray-300 text-gray-900',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="expense-amount" className="block text-base font-medium text-gray-700 mb-2">Amount</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-gray-400">₹</span>
            <input
              id="expense-amount" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              inputMode="decimal" placeholder="450" className={clsx(ODO_INPUT, 'pl-10')}
            />
          </div>
        </div>

        <PhotoField label="Photograph the receipt" file={receipt} onPick={setReceipt} />

        <Primary onClick={() => void save()} disabled={busy || !amount || !receipt}>
          {busy ? 'Saving…' : 'Add expense'}
        </Primary>
      </div>
    </Sheet>
  )
}
