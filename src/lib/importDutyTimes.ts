/**
 * Resolving the duty window from a client trip export.
 *
 * The export is not trustworthy about which of the two times is the start. In
 * the file we profiled, 101 of 1073 rows had `end <= start` on the same date,
 * and 99 of those were the two times simply **reversed** — not midnight
 * crossings. Rolling the end date forward instead, which is the obvious guess,
 * turns a 3.5-hour duty into a 20.5-hour one and misprices it: for Intra City
 * the hour count picks the rate slab.
 *
 * Newer exports mix both faults, so this decides per row rather than applying
 * one rule to the file.
 *
 * The discriminator is the client's own `Daily Journey Time`. It is reliable
 * where the window is coherent — 400 of 400 sampled good rows agreed with the
 * computed duration to within an hour — so it can referee the rows that are not.
 *
 * Anything it cannot referee is returned `ambiguous` and must not be imported
 * on a guess; a 12-hour duty is exactly as consistent with a swap as with a
 * rollover, and no amount of arithmetic breaks that tie.
 */

/** How far the computed duration may sit from the stated hours and still count. */
const TOLERANCE_HOURS = 1.5

export type TimeFix = 'none' | 'swapped' | 'rolled' | 'ambiguous'

export interface RawDutyTimes {
  /** dd-mm-yyyy, as the sheet stores it. */
  startDate: string
  endDate: string
  /** HH:MM or HH:MM:SS. */
  startTime: string
  endTime: string
  /** `Daily Journey Time`, whole hours. Null when the column is blank. */
  statedHours: number | null
}

export interface ResolvedDutyTimes {
  /** ISO yyyy-mm-dd, ready for a date column. */
  startDate: string
  endDate: string
  reportingTime: string
  estDropTime: string
  fix: TimeFix
  /** Set only when `fix` is 'ambiguous' — why it could not be decided. */
  reason?: string
}

/**
 * "16-01-2024" → "2024-01-16". Throws rather than guessing at a bad shape.
 *
 * The calendar is checked, not just the ranges: 31-02 passes a 1..31 day test
 * and then flows through the whole resolver as a confident answer, because
 * Date.parse('2024-02-31') is NaN and every comparison against NaN is false.
 * Postgres rejects the row on insert — but only after preflight showed it green.
 */
export function parseSheetDate(ddmmyyyy: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddmmyyyy.trim())
  if (!m) throw new Error(`Unrecognised date: ${ddmmyyyy}`)
  const [, dd, mm, yyyy] = m
  const month = Number(mm), day = Number(dd)
  const iso = `${yyyy}-${mm}-${dd}`
  const d = new Date(`${iso}T00:00:00Z`)
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== Number(yyyy) ||
    d.getUTCMonth() + 1 !== month ||
    d.getUTCDate() !== day
  ) {
    throw new Error(`Impossible date: ${ddmmyyyy}`)
  }
  return iso
}

/**
 * A daily journey must sit inside its own trip.
 *
 * This replaces an earlier idea of refereeing dates against the `Month` column.
 * `Month` turned out to be the **settlement** month, not the travel month — it
 * lags the trip start by 0, 1 or even 3 months in the file we profiled, so it
 * raised 192 false alarms on data that was entirely correct.
 *
 * The trip window is the invariant that actually holds: 0 of 1073 rows started
 * outside it. The end gets a one-day allowance, because a duty that genuinely
 * crosses midnight has its own end date rolled while the trip end stays on the
 * start day — two real rows in the sample do exactly that.
 *
 * All arguments are ISO yyyy-mm-dd. Returns null when the row is consistent.
 */
export function tripWindowViolation(
  dutyStart: string, dutyEnd: string, tripStart: string, tripEnd: string,
): string | null {
  if (dutyStart < tripStart || dutyStart > tripEnd) {
    return `Duty starts ${dutyStart}, outside the trip window ${tripStart} → ${tripEnd}.`
  }
  const latest = addDays(tripEnd, 1)
  if (dutyEnd < tripStart || dutyEnd > latest) {
    return `Duty ends ${dutyEnd}, outside the trip window ${tripStart} → ${tripEnd} (+1 day for a midnight crossing).`
  }
  return null
}

/** "11:00:00" | "11:00" → minutes past midnight. */
function toMinutes(hhmmss: string): number {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hhmmss.trim())
  if (!m) throw new Error(`Unrecognised time: ${hhmmss}`)
  const h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) throw new Error(`Impossible time: ${hhmmss}`)
  return h * 60 + min
}

/** "11:00:00" | "11:00" → "11:00:00". */
function normalizeTime(hhmmss: string): string {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hhmmss.trim())
  if (!m) throw new Error(`Unrecognised time: ${hhmmss}`)
  return `${m[1].padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}`
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`)
  const b = Date.parse(`${toIso}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

export function resolveDutyTimes(raw: RawDutyTimes): ResolvedDutyTimes {
  const startDate = parseSheetDate(raw.startDate)
  const endDate   = parseSheetDate(raw.endDate)
  const startMin  = toMinutes(raw.startTime)
  const endMin    = toMinutes(raw.endTime)
  const startTime = normalizeTime(raw.startTime)
  const endTime   = normalizeTime(raw.endTime)

  const dayGap  = daysBetween(startDate, endDate)
  const spanMin = dayGap * 1440 + (endMin - startMin)

  // Coherent window: end genuinely after start. Nothing to referee.
  if (spanMin > 0) {
    return { startDate, endDate, reportingTime: startTime, estDropTime: endTime, fix: 'none' }
  }

  // end_date before start_date is a corruption neither candidate explains.
  if (dayGap < 0) {
    return {
      startDate, endDate, reportingTime: startTime, estDropTime: endTime,
      fix: 'ambiguous', reason: 'End date is before the start date.',
    }
  }

  // Both candidates only make sense on a single-day row.
  if (dayGap > 0) {
    return {
      startDate, endDate, reportingTime: startTime, estDropTime: endTime,
      fix: 'ambiguous', reason: 'Multi-day window with end at or before start.',
    }
  }

  if (raw.statedHours == null) {
    return {
      startDate, endDate, reportingTime: startTime, estDropTime: endTime,
      fix: 'ambiguous', reason: 'No stated duration to resolve the times against.',
    }
  }

  // Candidate A — the two times are reversed.
  const swappedHours = (startMin - endMin) / 60
  // Candidate B — the duty crossed midnight and the end date was not rolled.
  const rolledHours  = 24 - swappedHours

  const swapErr = Math.abs(swappedHours - raw.statedHours)
  const rollErr = Math.abs(rolledHours  - raw.statedHours)

  const best = Math.min(swapErr, rollErr)
  if (best > TOLERANCE_HOURS) {
    return {
      startDate, endDate, reportingTime: startTime, estDropTime: endTime,
      fix: 'ambiguous',
      reason: `Neither reading matches the stated ${raw.statedHours}h `
            + `(swapped ${swappedHours}h, rolled ${rolledHours}h).`,
    }
  }
  if (swapErr === rollErr) {
    return {
      startDate, endDate, reportingTime: startTime, estDropTime: endTime,
      fix: 'ambiguous',
      reason: `Both readings give ${raw.statedHours}h — a swap and a rollover are indistinguishable here.`,
    }
  }

  if (swapErr < rollErr) {
    // Reversed: the later clock time was the real start.
    return { startDate, endDate, reportingTime: endTime, estDropTime: startTime, fix: 'swapped' }
  }
  return {
    startDate, endDate: addDays(endDate, 1),
    reportingTime: startTime, estDropTime: endTime, fix: 'rolled',
  }
}
