/**
 * Driver app data layer.
 *
 * Everything a driver session can touch goes through here: three views to read,
 * six RPCs to write, and nothing else. There is no `.from('duties')` in the
 * driver pages, because a driver has no policy on that table — see migration
 * 025 for why (the rate columns share the row).
 *
 * Photographs and signatures are billing evidence, so uploads go to the
 * private bucket under {company_id}/duty-slips/, which is the only path the
 * driver storage policy accepts.
 */

import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { atTime, departurePrompt } from './dutyTime'

const BUCKET = 'vehicle-documents'

// ── who is signed in ─────────────────────────────────────────────────────────

/**
 * A driver session is an ordinary Supabase session with a claim set by the
 * driver-auth Edge Function. Reading it needs no query, which matters: the
 * shell has to decide operator-or-driver before it renders anything.
 */
export function isDriverSession(session: Session | null): boolean {
  return session?.user?.app_metadata?.role === 'driver'
}

export interface DriverMe {
  id: number
  driverRef: string
  name: string
  companyId: number
  companyName: string
  companyPhone: string | null
}

export async function loadMe(): Promise<DriverMe | null> {
  const { data, error } = await supabase.rpc('driver_me')
  if (error) { console.error('[driver] me:', error.message); return null }
  const row = data?.[0]
  if (!row) return null
  return {
    id: row.id,
    driverRef: row.driver_ref,
    name: row.name,
    companyId: row.company_id,
    companyName: row.company_name,
    companyPhone: row.company_phone,
  }
}

// ── sign in ──────────────────────────────────────────────────────────────────

export type SignInError =
  | 'unknown_id' | 'wrong_code' | 'locked' | 'inactive' | 'ambiguous' | 'server_error'

export interface SignInResult {
  ok: boolean
  error?: SignInError
  message?: string
}

/** `login` is a Driver ID or a phone number — the Edge Function works out
 *  which. A driver reliably knows their own number; "DR243652" they may not. */
export async function driverSignIn(login: string, code: string): Promise<SignInResult> {
  const { data, error } = await supabase.functions.invoke('driver-auth', {
    body: { action: 'signin', login, code },
  })

  // functions.invoke treats any non-2xx as an error and hides the body, so the
  // distinguishable failures of FR-4 have to be read back off the Response.
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
    return { ok: false, error: body?.error ?? 'server_error', message: body?.message ?? 'Could not sign in. Try again.' }
  }
  if (!data?.session) return { ok: false, error: 'server_error', message: 'Could not sign in. Try again.' }

  const { error: setErr } = await supabase.auth.setSession(data.session)
  if (setErr) return { ok: false, error: 'server_error', message: setErr.message }
  return { ok: true }
}

/** FR-6, operator side. Returns the new code once; it is never recoverable. */
export async function regenerateDriverCode(driverRowId: number): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('driver-auth', {
    body: { action: 'regenerate', driver_row_id: driverRowId },
  })
  if (error) { console.error('[driver] regenerate:', error.message); return null }
  return data?.code ?? null
}

// ── duties ───────────────────────────────────────────────────────────────────

export type DriverDutyStatus = 'Booked' | 'Allotted' | 'On-Going' | 'Completed' | 'Billed' | 'Cancelled'

export interface DriverDuty {
  id: number
  status: DriverDutyStatus
  startDate: string
  endDate: string
  reportingTime: string | null
  estDropTime: string | null
  garageStartMins: number | null
  dutyType: string | null
  fromLocation: string | null
  toLocation: string | null
  reportingAddress: string | null
  dropAddress: string | null
  driverNotes: string | null
  startedAt: string | null
  pickedUpAt: string | null
  closedAt: string | null
  startOdo: number | null
  endOdo: number | null
  startOdoPhoto: string | null
  endOdoPhoto: string | null
  signaturePath: string | null
  noShowReason: string | null
  bookingRef: string
  customerName: string
  bookedByName: string | null
  bookedByPhone: string | null
  vehicleNumber: string | null
  vehicleModel: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toDuty(r: any): DriverDuty {
  return {
    id: r.id,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    reportingTime: r.reporting_time,
    estDropTime: r.est_drop_time,
    garageStartMins: r.garage_start_mins,
    dutyType: r.duty_type,
    fromLocation: r.from_location,
    toLocation: r.to_location,
    reportingAddress: r.reporting_address,
    dropAddress: r.drop_address,
    driverNotes: r.driver_notes,
    startedAt: r.started_at,
    pickedUpAt: r.picked_up_at,
    closedAt: r.closed_at,
    startOdo: r.start_odo == null ? null : Number(r.start_odo),
    endOdo: r.end_odo == null ? null : Number(r.end_odo),
    startOdoPhoto: r.start_odo_photo,
    endOdoPhoto: r.end_odo_photo,
    signaturePath: r.signature_path,
    noShowReason: r.no_show_reason,
    bookingRef: r.booking_ref,
    customerName: r.customer_name,
    bookedByName: r.booked_by_name,
    bookedByPhone: r.booked_by_phone,
    vehicleNumber: r.vehicle_number,
    vehicleModel: r.vehicle_model,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function loadDuties(): Promise<DriverDuty[]> {
  const { data, error } = await supabase
    .from('driver_duties')
    .select('*')
    .order('start_date', { ascending: true })
    .order('reporting_time', { ascending: true, nullsFirst: true })

  if (error) { console.error('[driver] duties:', error.message); return [] }
  return (data ?? []).map(toDuty)
}

export interface Passenger { id: number; name: string; phone: string | null }

export async function loadPassengers(dutyId: number): Promise<Passenger[]> {
  const { data, error } = await supabase
    .from('driver_duty_passengers')
    .select('id, name, phone')
    .eq('duty_id', dutyId)
    .order('sort_order')
  if (error) { console.error('[driver] passengers:', error.message); return [] }
  return data ?? []
}

export interface DriverExpense {
  id: number
  dutyId: number | null
  type: string
  amount: number
  receiptUrl: string | null
}

export async function loadExpenses(dutyId: number): Promise<DriverExpense[]> {
  const { data, error } = await supabase
    .from('driver_expenses')
    .select('id, duty_id, type, amount, receipt_url')
    .eq('duty_id', dutyId)
    .order('created_at')
  if (error) { console.error('[driver] expenses:', error.message); return [] }
  return (data ?? []).map(r => ({
    id: r.id, dutyId: r.duty_id, type: r.type,
    amount: Number(r.amount), receiptUrl: r.receipt_url,
  }))
}

// FR-36 — any outlay, not tolls alone.
export const EXPENSE_TYPES = ['Toll', 'Parking', 'Fuel', 'Driver allowance', 'Other'] as const

// ── lifecycle ────────────────────────────────────────────────────────────────
// Every one of these is idempotent server-side, so a retry is always safe.
// They return an error string rather than throwing: these are called from
// buttons a driver is tapping in traffic, and the caller always has to show
// something.

async function call(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const { error } = await supabase.rpc(fn, args)
  if (error) { console.error(`[driver] ${fn}:`, error.message); return error.message }
  return null
}

export const startDuty = (dutyId: number, odo: number, photo: string) =>
  call('driver_start_duty', { p_duty_id: dutyId, p_odo: odo, p_photo: photo })

export const markPickup = (dutyId: number) =>
  call('driver_mark_pickup', { p_duty_id: dutyId })

export const markNoShow = (dutyId: number, reason: string) =>
  call('driver_mark_no_show', { p_duty_id: dutyId, p_reason: reason })

export const closeDuty = (dutyId: number, odo: number, photo: string, signature: string) =>
  call('driver_close_duty', { p_duty_id: dutyId, p_odo: odo, p_photo: photo, p_signature: signature })

export const addExpense = (dutyId: number, type: string, amount: number, receipt: string | null) =>
  call('driver_add_expense', { p_duty_id: dutyId, p_type: type, p_amount: amount, p_receipt: receipt })

export const deleteExpense = (expenseId: number) =>
  call('driver_delete_expense', { p_expense_id: expenseId })

// ── evidence ─────────────────────────────────────────────────────────────────

/**
 * A phone camera produces 3–12MP JPEGs and drivers are on bad connections, so
 * these are downscaled before upload — but never below 1280px on the long
 * edge, because a disputed odometer reading has to be settleable from the
 * image months later. Images already smaller than the cap are left alone
 * rather than re-encoded.
 */
const MAX_EDGE = 1600

/**
 * Never throws. `createImageBitmap` rejects on anything the browser cannot
 * decode — a HEIC straight off an iPhone, a truncated capture — and a throw
 * here would escape the submit handler and leave the button stuck on "Saving…"
 * with nothing said. Shrinking is an optimisation; the upload is not.
 */
export async function downscale(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const longEdge = Math.max(bitmap.width, bitmap.height)
    if (longEdge <= MAX_EDGE) { bitmap.close(); return file }

    const scale = MAX_EDGE / longEdge
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.85))
    return blob ?? file
  } catch (e) {
    console.warn('[driver] could not downscale, sending the original:', e)
    return file
  }
}

export type EvidenceKind = 'start-odo' | 'end-odo' | 'signature' | 'receipt'

/**
 * Shrink then upload, returning the storage PATH — the bucket is private, so a
 * URL would be a signed one that expires. Paths do not.
 *
 * Returns null on any failure rather than throwing, for the same reason
 * downscale swallows: every caller is a button a driver is tapping in traffic
 * and has to be able to say something.
 */
export async function captureEvidence(
  companyId: number,
  dutyId: number,
  kind: EvidenceKind,
  source: Blob,
): Promise<string | null> {
  try {
    const body = source instanceof File ? await downscale(source) : source
    const ext = body.type === 'image/png' ? 'png' : 'jpg'
    const path = `${companyId}/duty-slips/${dutyId}-${kind}-${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from(BUCKET).upload(path, body, { upsert: false })
    if (error) { console.error('[driver] upload:', error.message); return null }
    return data.path
  } catch (e) {
    console.error('[driver] upload threw:', e)
    return null
  }
}

export async function signedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
  if (error) { console.error('[driver] sign:', error.message); return null }
  return data.signedUrl
}

// ── stage ────────────────────────────────────────────────────────────────────

/**
 * FR-25 — the driver needs confirmation that their tap landed, so every
 * transition has to be visible. The duty's own `status` column can't carry
 * that: it has one value, `On-Going`, for both "driving to the pickup" and
 * "passenger in the car". Stage is read off the observed timestamps instead.
 */
export type DutyStage = 'not-started' | 'started' | 'on-board' | 'completed' | 'no-show'

export function dutyStage(d: DriverDuty): DutyStage {
  if (d.noShowReason) return 'no-show'
  if (d.closedAt) return 'completed'
  // Prefer the observed event, fall back to the column — every duty that ran
  // before this app existed, and every one an operator closes under FR-59, has
  // the status without the timestamp. Without this they read "Not started"
  // forever on the Completed tab.
  if (d.status === 'Completed' || d.status === 'Billed') return 'completed'
  if (d.pickedUpAt) return 'on-board'
  if (d.startedAt) return 'started'
  return 'not-started'
}

export const STAGE_LABEL: Record<DutyStage, string> = {
  'not-started': 'Not started',
  started: 'Duty started',
  'on-board': 'Passenger on board',
  completed: 'Completed',
  'no-show': 'No show',
}

// ── time ─────────────────────────────────────────────────────────────────────
// Formatting lives in dutyTime.ts so it can be checked without a browser.
// Re-exported so the pages have one import, not two.

export { countdown, formatTime, formatDate, duration } from './dutyTime'

export const dutyStart = (duty: DriverDuty) => atTime(duty.startDate, duty.reportingTime)
export const dutyDeparturePrompt = (duty: DriverDuty) => departurePrompt(duty.garageStartMins)

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
