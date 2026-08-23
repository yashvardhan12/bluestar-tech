/** Availability + option-list shaping for the allotment drawer.
 *
 *  Pure on purpose — no supabase, no react — so `allotOptions.check.ts` can run
 *  the overlap and ordering rules under plain node. `AllotDrawer.tsx` owns the
 *  queries and the markup; everything that can be got wrong quietly lives here.
 */

export type DriverStatus = 'Active' | 'Inactive' | 'Available' | 'Assigned' | 'Unavailable'

/** Statuses View 3 (the default driver list) is willing to show. */
export const PICKABLE_STATUSES: DriverStatus[] = ['Active', 'Available']
/** Statuses that earn an amber flag in View 4 — should not be driving today. */
export const FLAGGED_STATUSES: DriverStatus[] = ['Inactive', 'Unavailable']

export interface DutyWindow {
  id?: number
  start_date: string
  end_date: string | null
  reporting_time: string | null
  est_drop_time: string | null
}
export interface Interval { start: number; end: number }
export interface BusyEntry { dutyId: number; iv: Interval }
/** A duty that overlaps the window being allotted. */
export interface Conflict { dutyId: number; endMs: number }

// ── duty windows ──────────────────────────────────────────────────────────────
// Each duty occupies [start_date + reporting_time, end_date + est_drop_time];
// a missing reporting time = start of day, a missing drop time = end of day.

export function toMs(date: string, time: string | null, fallback: string): number {
  const [h, m] = (time ?? fallback).split(':')
  const d = new Date(`${date}T00:00:00`)
  d.setHours(Number(h), Number(m), 0, 0)
  return d.getTime()
}

export function dutyInterval(d: DutyWindow): Interval {
  return {
    start: toMs(d.start_date, d.reporting_time, '00:00'),
    end: toMs(d.end_date ?? d.start_date, d.est_drop_time, '23:59'),
  }
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start
}

/** Group busy duty windows by vehicle_id or driver_id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function busyMap(rows: any[] | null, key: 'vehicle_id' | 'driver_id'): Map<number, BusyEntry[]> {
  const m = new Map<number, BusyEntry[]>()
  for (const r of rows ?? []) {
    const id = r[key] as number | null
    if (id == null) continue
    const list = m.get(id) ?? []
    list.push({ dutyId: r.id as number, iv: dutyInterval(r) })
    m.set(id, list)
  }
  return m
}

/** The first busy window that clashes with any target window, or null if free. */
export function conflictOf(busy: BusyEntry[] | undefined, targets: Interval[]): Conflict | null {
  for (const b of busy ?? []) {
    if (targets.some(t => overlaps(b.iv, t))) return { dutyId: b.dutyId, endMs: b.iv.end }
  }
  return null
}

/** "18:30" when the clash ends on `refDate`, "25 Aug 18:30" when it runs past it. */
export function untilLabel(endMs: number, refDate: string): string {
  const end = new Date(endMs)
  const hhmm = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
  const ref = new Date(`${refDate}T00:00:00`)
  const sameDay = end.getFullYear() === ref.getFullYear()
    && end.getMonth() === ref.getMonth()
    && end.getDate() === ref.getDate()
  if (sameDay) return hhmm
  const day = end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return `${day} ${hhmm}`
}

// ── ordering ──────────────────────────────────────────────────────────────────
// Both lists rank the same way: clean rows first, then the softly-marked ones,
// then the ones carrying a real warning. Rank 0/1 sort above 2/3 so an operator
// never has to scroll past problems to reach a vehicle they can just take.

function byRank<T>(rows: T[], rank: (r: T) => number, label: (r: T) => string): T[] {
  return [...rows].sort((a, b) => rank(a) - rank(b) || label(a).localeCompare(label(b)))
}

export interface VehicleRank { vehicleGroup: string; modelName: string; busy: Conflict | null }
export function sortVehicles<T extends VehicleRank>(rows: T[], ownGroup: string): T[] {
  return byRank(rows, v => (v.busy ? 2 : 0) + (ownGroup && v.vehicleGroup !== ownGroup ? 1 : 0), v => v.modelName)
}

export interface DriverRank { name: string; status: DriverStatus; busy: Conflict | null }
export function sortDrivers<T extends DriverRank>(rows: T[]): T[] {
  return byRank(rows, d => (d.busy ? 2 : 0) + (isFlagged(d.status) ? 1 : 0), d => d.name)
}

export function isFlagged(status: DriverStatus): boolean {
  return FLAGGED_STATUSES.includes(status)
}

// ── search ────────────────────────────────────────────────────────────────────

/** Case-insensitive "does any field contain the query". Empty query matches all. */
export function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.some(f => (f ?? '').toLowerCase().includes(q))
}

// ── driver status filter (View 4) ─────────────────────────────────────────────

export type DriverScope = 'all' | 'pickable' | 'assigned' | 'flagged'

export const DRIVER_SCOPES: { value: DriverScope; label: string }[] = [
  { value: 'all',      label: 'All drivers' },
  { value: 'pickable', label: 'Available & Active' },
  { value: 'assigned', label: 'Assigned to a vehicle' },
  { value: 'flagged',  label: 'Inactive or Unavailable' },
]

export function inScope(status: DriverStatus, scope: DriverScope): boolean {
  if (scope === 'all') return true
  if (scope === 'pickable') return PICKABLE_STATUSES.includes(status)
  if (scope === 'assigned') return status === 'Assigned'
  return isFlagged(status)
}
