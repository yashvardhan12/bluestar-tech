/**
 * Turning a client trip export into bookings.
 *
 * Pure: takes already-parsed sheet rows so `importBookings.check.ts` can run it
 * without a spreadsheet or a database. The modal does the file reading and the
 * writing; every decision about what the file means happens here.
 *
 * The rules that are easy to get wrong, and why:
 *
 *  - Group on `Travel ID`, never `Trip ID`. Eight Trip IDs in the sample hold
 *    two separate bookings with different start dates; grouping on Trip ID
 *    silently merges two customers' journeys into one.
 *  - `booking_ref` takes the Travel ID. The UNIQUE index on it is the entire
 *    re-run strategy — there is no import-state table.
 *  - Customers match on the GSTIN embedded in `customers.name`, not on
 *    `customers.gstin_number` (that is the billing GSTIN and may differ) and
 *    never on company name: one name spans seven tax entities.
 *  - No money and no vehicle are imported, and no status is written.
 */

import { resolveDutyTimes, parseSheetDate, tripWindowViolation } from './importDutyTimes.ts'
import type { DutyWindow } from './dutyWindows.ts'

export const COL = {
  travel: 'Travel ID', trip: 'Trip ID',
  tripStart: 'Trip Start Date', tripEnd: 'Trip End Date',
  djStartDate: 'Daily Journey Start Date', djStartTime: 'Daily Journey Start Time',
  djEndDate: 'Daily Journey End Date', djEndTime: 'Daily Journey End Time',
  hours: 'Daily Journey Time',
  pkg: 'Package Type', car: 'Car Type', zone: 'Zone No',
  src: 'Source', dst: 'Destination',
  company: 'Company name', gstin: 'Company GSTIN',
  employee: 'Employee name',
} as const

export const REQUIRED_COLUMNS: string[] = Object.values(COL)

export type SheetRow = Record<string, string | number | null | undefined>

export interface DutyTypeRef { name: string; category: string; vehicleGroup: string | null }

export interface ReferenceData {
  /** `customers.name`, GSTIN embedded in the text. */
  customers: string[]
  dutyTypes: DutyTypeRef[]
  locations: string[]
  /**
   * booking_ref → the duty start_dates already stored for it.
   *
   * Present with dates = imported. Present but empty = an interrupted run left
   * it duty-less and it must be re-run, not skipped. Absent = new.
   */
  existingDuties: Record<string, string[]>
}

export type Blocker = 'customer' | 'dutyType' | 'location' | 'time'

export interface PreparedBooking {
  travelId: string
  company: string
  gstin: string
  customer: string | null
  dutyType: string | null
  wantedDutyType: string | null
  category: string
  vehicleGroup: string | null
  from: string
  to: string
  startDate: string
  endDate: string
  duties: DutyWindow[]
  blockers: Blocker[]
  ok: boolean
  /** Already present with duties — skipped on re-run rather than duplicated. */
  alreadyImported: boolean
}

export interface MissingRef { key: string; label: string; bookings: number; duties: number }

/** Two sheet rows describing the same day of the same trip. */
export interface DuplicateRow { travelId: string; date: string; count: number }

/**
 * A booking already imported whose sheet rows cover days it does not have.
 *
 * Long trips span calendar months — one in the sample runs 1 Jan to 30 Apr — so
 * a client that splits them across monthly exports would otherwise have its
 * later days silently dropped by the skip rule.
 */
export interface IncompleteBooking {
  travelId: string
  existingDuties: number
  inSheet: number
  missingDates: string[]
}

export interface UnresolvedRow {
  travelId: string
  when: string
  statedHours: string
  reason: string
}

export interface ImportPlan {
  rowCount: number
  bookings: PreparedBooking[]
  ready: PreparedBooking[]
  missingCustomers: MissingRef[]
  missingDutyTypes: MissingRef[]
  missingLocations: MissingRef[]
  unresolved: UnresolvedRow[]
  duplicateRows: DuplicateRow[]
  incomplete: IncompleteBooking[]
  fixTally: { none: number; swapped: number; rolled: number; ambiguous: number }
}

const GSTIN = /\b(\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z0-9]{2})\b/

/** The GSTIN a customer record is keyed by, taken from inside its name. */
export function gstinOf(name: string): string | null {
  const m = GSTIN.exec(name.toUpperCase())
  return m ? m[1] : null
}

/**
 * Collapses `Airport Zone - 1 | Sedan` and `Airport Zone 1 | Sedan` onto one
 * key — both spellings are live in the duty_types table.
 */
export function dutyTypeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9|]/g, '')
}

/** Package + car (+ zone, for Airport only) → the duty type name to look for. */
export function expectedDutyType(pkg: string, car: string, zone: string): string | null {
  const c = car.trim()
  if (!c) return null
  switch (pkg) {
    case 'Airport Pick Up': return `Airport Zone ${String(zone).trim()} | ${c}`
    case 'Intra City':      return `Hourly | ${c}`
    case 'Monthly':         return `Monthly | ${c}`
    case 'Outstation':      return `Outdoor | ${c}`
    default:                return null
  }
}

const text = (v: unknown): string => (v == null ? '' : String(v).trim())

/** Columns the export must carry. Returns the ones it does not. */
export function missingColumns(headers: string[]): string[] {
  return REQUIRED_COLUMNS.filter(c => !headers.includes(c))
}

export function buildImportPlan(rows: SheetRow[], ref: ReferenceData): ImportPlan {
  const custByGstin = new Map<string, string>()
  for (const name of ref.customers) {
    const g = gstinOf(name)
    if (g) custByGstin.set(g, name)
  }
  const dutyByKey = new Map<string, DutyTypeRef>()
  for (const d of ref.dutyTypes) dutyByKey.set(dutyTypeKey(d.name), d)
  const locSet = new Set(ref.locations.map(l => l.trim().toLowerCase()))
  const existing = ref.existingDuties

  const groups = new Map<string, SheetRow[]>()
  for (const r of rows) {
    const id = text(r[COL.travel])
    const list = groups.get(id)
    if (list) list.push(r)
    else groups.set(id, [r])
  }

  const fixTally = { none: 0, swapped: 0, rolled: 0, ambiguous: 0 }
  const missCust = new Map<string, MissingRef>()
  const missType = new Map<string, MissingRef>()
  const missLoc = new Map<string, MissingRef>()
  const unresolved: UnresolvedRow[] = []
  const duplicateRows: DuplicateRow[] = []
  const incomplete: IncompleteBooking[] = []
  const bookings: PreparedBooking[] = []

  const note = (m: Map<string, MissingRef>, key: string, label: string, duties: number) => {
    const cur = m.get(key)
    if (cur) { cur.bookings++; cur.duties += duties }
    else m.set(key, { key, label, bookings: 1, duties })
  }

  for (const [travelId, rs] of groups) {
    const head = rs[0]
    const blockers: Blocker[] = []

    const gstin = text(head[COL.gstin]).toUpperCase()
    const customer = custByGstin.get(gstin) ?? null
    if (!customer) {
      blockers.push('customer')
      note(missCust, gstin || '(no GSTIN)', text(head[COL.company]), rs.length)
    }

    const pkg = text(head[COL.pkg])
    const car = text(head[COL.car])
    const wanted = expectedDutyType(pkg, car, text(head[COL.zone]))
    const dt = wanted ? dutyByKey.get(dutyTypeKey(wanted)) ?? null : null
    if (!dt) {
      blockers.push('dutyType')
      note(missType, wanted ?? `${pkg} | ${car}`, wanted ?? `${pkg} | ${car}`, rs.length)
    }

    const from = text(head[COL.src])
    const to = text(head[COL.dst])
    for (const loc of [from, to]) {
      if (loc && !locSet.has(loc.toLowerCase())) {
        if (!blockers.includes('location')) blockers.push('location')
        note(missLoc, loc, loc, rs.length)
      }
    }

    let tripStart = '', tripEnd = ''
    try {
      tripStart = parseSheetDate(text(head[COL.tripStart]))
      tripEnd = parseSheetDate(text(head[COL.tripEnd]))
    } catch (e) {
      unresolved.push({
        travelId, when: text(head[COL.tripStart]), statedHours: '',
        reason: (e as Error).message,
      })
      blockers.push('time')
    }

    // Two rows for the same day of the same trip would become two duties on one
    // date. Not present in the sample, but the sheet has nothing preventing it.
    const seenDays = new Set<string>()
    const dayCounts = new Map<string, number>()
    for (const r of rs) {
      const d = text(r[COL.djStartDate])
      dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1)
    }
    for (const [date, count] of dayCounts) {
      if (count > 1) duplicateRows.push({ travelId, date, count })
    }

    const duties: DutyWindow[] = []
    for (const r of rs) {
      let res
      try {
        res = resolveDutyTimes({
          startDate: text(r[COL.djStartDate]), endDate: text(r[COL.djEndDate]),
          startTime: text(r[COL.djStartTime]), endTime: text(r[COL.djEndTime]),
          statedHours: r[COL.hours] == null ? null : Number(r[COL.hours]),
        })
      } catch (e) {
        res = { fix: 'ambiguous' as const, reason: (e as Error).message,
                startDate: '', endDate: '', reportingTime: '', estDropTime: '' }
      }
      fixTally[res.fix]++

      const window = tripStart && tripEnd && res.fix !== 'ambiguous'
        ? tripWindowViolation(res.startDate, res.endDate, tripStart, tripEnd)
        : null

      if (res.fix === 'ambiguous' || window) {
        unresolved.push({
          travelId,
          when: `${text(r[COL.djStartDate])} ${text(r[COL.djStartTime])} → ${text(r[COL.djEndTime])}`,
          statedHours: text(r[COL.hours]),
          reason: res.fix === 'ambiguous' ? (res.reason ?? 'Could not be resolved.') : window!,
        })
        if (!blockers.includes('time')) blockers.push('time')
        continue
      }

      if (seenDays.has(res.startDate)) continue
      seenDays.add(res.startDate)
      duties.push({
        start_date: res.startDate, end_date: res.endDate,
        reporting_time: res.reportingTime, est_drop_time: res.estDropTime,
      })
    }

    if (duties.length === 0 && !blockers.includes('time')) blockers.push('time')

    // A booking already present counts as imported only when the file adds
    // nothing to it. Long trips can arrive split across monthly exports, and a
    // blanket skip on booking_ref would drop the later days without a word.
    const stored = existing[travelId]
    const storedDates = new Set(stored ?? [])
    const newDates = duties.map(d => d.start_date).filter(d => !storedDates.has(d))
    const alreadyImported = stored !== undefined && stored.length > 0 && newDates.length === 0
    if (stored !== undefined && stored.length > 0 && newDates.length > 0) {
      incomplete.push({
        travelId, existingDuties: stored.length, inSheet: duties.length, missingDates: newDates,
      })
    }
    bookings.push({
      travelId, company: text(head[COL.company]), gstin,
      customer, dutyType: dt?.name ?? null, wantedDutyType: wanted,
      category: dt?.category ?? '', vehicleGroup: dt?.vehicleGroup ?? null,
      from, to, startDate: tripStart, endDate: tripEnd,
      duties, blockers,
      ok: blockers.length === 0 && !alreadyImported,
      alreadyImported,
    })
  }

  const bySize = (a: MissingRef, b: MissingRef) => b.bookings - a.bookings

  return {
    rowCount: rows.length,
    bookings,
    ready: bookings.filter(b => b.ok),
    missingCustomers: [...missCust.values()].sort(bySize),
    missingDutyTypes: [...missType.values()].sort(bySize),
    missingLocations: [...missLoc.values()].sort(bySize),
    unresolved,
    duplicateRows,
    incomplete,
    fixTally,
  }
}

/** The `bookings` columns for a prepared booking. No status, no company_id, no money. */
export function bookingPayload(b: PreparedBooking): Record<string, unknown> {
  return {
    customer_name: b.customer,
    duty_type: b.dutyType,
    vehicle_group: b.vehicleGroup,
    booking_type: b.category === 'Outstation' ? 'outstation' : 'local',
    is_airport_booking: b.category === 'Airport',
    from_location: b.from || null,
    to_location: b.to || null,
    start_date: b.startDate,
    end_date: b.endDate,
    reporting_time: b.duties[0]?.reporting_time ?? null,
    est_drop_time: b.duties[b.duties.length - 1]?.est_drop_time ?? null,
  }
}

/** The duty columns copied down from the booking. Per-day times override these. */
export function dutyShared(b: PreparedBooking): Record<string, unknown> {
  return {
    duty_type: b.dutyType,
    vehicle_group: b.vehicleGroup,
    from_location: b.from || null,
    to_location: b.to || null,
  }
}
