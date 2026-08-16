/**
 * Time and date formatting for the driver app.
 *
 * Split out of `driver.ts` so it stays free of the Supabase client and can be
 * checked by `dutyTime.check.ts` — same reason `money.ts` is separate from the
 * pages that use it.
 */

/** "HH:MM[:SS]" on an ISO date → a local Date. Mirrors toDatetime in bookingStatus.ts. */
export function atTime(isoDate: string, time: string | null): Date {
  const [hh, mm] = (time ?? '00:00').split(':')
  const d = new Date(isoDate)
  d.setHours(Number(hh), Number(mm), 0, 0)
  return d
}

/**
 * FR-10 — drivers reason in "in 30m", not in timestamps.
 *
 * Deliberately coarse past an hour: a driver glancing at a list at 5:30am
 * needs "In 4hr", and "In 3hr 47m" is worse, not better.
 */
export function countdown(to: Date, now: Date = new Date()): string {
  const mins = Math.round((to.getTime() - now.getTime()) / 60000)
  if (mins <= -60) return `${Math.round(-mins / 60)}hr ago`
  if (mins < 0) return `${-mins}m ago`
  if (mins === 0) return 'Now'
  if (mins < 60) return `In ${mins}m`
  if (mins < 24 * 60) return `In ${Math.round(mins / 60)}hr`
  return `In ${Math.round(mins / (24 * 60))}d`
}

export function formatTime(t: string | null): string {
  if (!t) return '—'
  const [hh, mm] = t.split(':')
  const h = Number(hh)
  return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'am' : 'pm'}`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** FR-14 — the prompt comes from the duty's own garage allowance, not a guess. */
export function departurePrompt(garageStartMins: number | null): string | null {
  if (!garageStartMins || garageStartMins <= 0) return null
  const m = garageStartMins
  if (m % 60 === 0) return `Leave ${m / 60} hr before reporting time.`
  if (m > 60) return `Leave ${Math.floor(m / 60)} hr ${m % 60} min before reporting time.`
  return `Leave ${m} min before reporting time.`
}

/** Duration between two ISO timestamps, as a driver would say it. */
export function duration(fromIso: string, toIso: string): string {
  const mins = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000))
  const h = Math.floor(mins / 60)
  return h === 0 ? `${mins} min` : `${h} hr ${mins % 60} min`
}
