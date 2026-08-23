/** node --experimental-strip-types src/lib/allotOptions.check.ts */
import assert from 'node:assert/strict'
import {
  dutyInterval, overlaps, busyMap, conflictOf, untilLabel,
  sortVehicles, sortDrivers, matches, inScope, isFlagged,
  type Conflict, type DriverStatus,
} from './allotOptions.ts'

const iv = (s: string, e: string) => ({ start: new Date(s).getTime(), end: new Date(e).getTime() })

// ── duty windows ──────────────────────────────────────────────────────────────
{
  const d = dutyInterval({ start_date: '2026-08-23', end_date: null, reporting_time: '09:30', est_drop_time: '18:30' })
  assert.equal(new Date(d.start).getHours(), 9)
  assert.equal(new Date(d.end).getHours(), 18)

  // missing times widen to the whole day, so a half-specified duty blocks rather than leaks
  const open = dutyInterval({ start_date: '2026-08-23', end_date: null, reporting_time: null, est_drop_time: null })
  assert.equal(new Date(open.start).getHours(), 0)
  assert.equal(new Date(open.end).getHours(), 23)

  // multi-day duty runs to the end date, not the start date
  const multi = dutyInterval({ start_date: '2026-08-23', end_date: '2026-08-25', reporting_time: '08:00', est_drop_time: '20:00' })
  assert.ok(multi.end - multi.start > 2 * 24 * 3600_000)
}

// ── overlap is half-open: touching windows do NOT clash ────────────────────────
{
  assert.equal(overlaps(iv('2026-08-23T09:00', '2026-08-23T14:00'), iv('2026-08-23T14:00', '2026-08-23T18:00')), false)
  assert.equal(overlaps(iv('2026-08-23T09:00', '2026-08-23T14:01'), iv('2026-08-23T14:00', '2026-08-23T18:00')), true)
  // full containment, both directions
  assert.equal(overlaps(iv('2026-08-23T10:00', '2026-08-23T11:00'), iv('2026-08-23T09:00', '2026-08-23T18:00')), true)
  assert.equal(overlaps(iv('2026-08-23T09:00', '2026-08-23T18:00'), iv('2026-08-23T10:00', '2026-08-23T11:00')), true)
}

// ── busyMap + conflictOf ──────────────────────────────────────────────────────
{
  const rows = [
    { id: 1032, vehicle_id: 7, driver_id: 3, start_date: '2026-08-23', end_date: null, reporting_time: '09:00', est_drop_time: '18:30' },
    { id: 1033, vehicle_id: 8, driver_id: null, start_date: '2026-08-23', end_date: null, reporting_time: '19:00', est_drop_time: '22:00' },
    { id: 1034, vehicle_id: null, driver_id: 4, start_date: '2026-08-23', end_date: null, reporting_time: '09:00', est_drop_time: '10:00' },
  ]
  const byVehicle = busyMap(rows, 'vehicle_id')
  const byDriver = busyMap(rows, 'driver_id')
  assert.equal(byVehicle.size, 2, 'null vehicle_id must not become a key')
  assert.equal(byDriver.size, 2, 'null driver_id must not become a key')

  const target = [dutyInterval({ start_date: '2026-08-23', end_date: null, reporting_time: '17:00', est_drop_time: '21:00' })]
  const clash = conflictOf(byVehicle.get(7), target)
  assert.equal(clash?.dutyId, 1032, 'must name the duty it clashes with, not just report busy')
  assert.equal(conflictOf(byDriver.get(4), target), null, 'driver 4 finishes at 10:00, well clear of the window')
}
{
  // vehicle 8 (19:00-22:00) genuinely overlaps 17:00-21:00 — assert the true direction
  const rows = [{ id: 1033, vehicle_id: 8, start_date: '2026-08-23', end_date: null, reporting_time: '19:00', est_drop_time: '22:00' }]
  const target = [dutyInterval({ start_date: '2026-08-23', end_date: null, reporting_time: '17:00', est_drop_time: '21:00' })]
  assert.equal(conflictOf(busyMap(rows, 'vehicle_id').get(8), target)?.dutyId, 1033)
  // and a window that ends before it starts does not
  const early = [dutyInterval({ start_date: '2026-08-23', end_date: null, reporting_time: '06:00', est_drop_time: '19:00' })]
  assert.equal(conflictOf(busyMap(rows, 'vehicle_id').get(8), early), null)
  assert.equal(conflictOf(undefined, early), null, 'a vehicle with no duties is free')
}

// ── until label ───────────────────────────────────────────────────────────────
{
  const same = new Date('2026-08-23T18:30:00').getTime()
  assert.equal(untilLabel(same, '2026-08-23'), '18:30')
  const later = new Date('2026-08-25T18:30:00').getTime()
  assert.ok(untilLabel(later, '2026-08-23').includes('18:30'))
  assert.notEqual(untilLabel(later, '2026-08-23'), '18:30', 'a clash running past today must show its date')
}

// ── ordering ──────────────────────────────────────────────────────────────────
{
  const c: Conflict = { dutyId: 1, endMs: 0 }
  const v = [
    { modelName: 'Zen',      vehicleGroup: 'Sedan', busy: null },
    { modelName: 'Fortuner', vehicleGroup: 'SUV',   busy: c },
    { modelName: 'Innova',   vehicleGroup: 'SUV',   busy: null },
    { modelName: 'Etios',    vehicleGroup: 'Sedan', busy: c },
    { modelName: 'Amaze',    vehicleGroup: 'Sedan', busy: null },
  ]
  assert.deepEqual(
    sortVehicles(v, 'Sedan').map(r => r.modelName),
    ['Amaze', 'Zen', 'Innova', 'Etios', 'Fortuner'],
    'free-own-group, free-other-group, busy-own-group, busy-other-group; alphabetical within each',
  )
  // with no duty group, group stops being a tiebreak and only busy-ness ranks
  assert.deepEqual(sortVehicles(v, '').map(r => r.modelName), ['Amaze', 'Innova', 'Zen', 'Etios', 'Fortuner'])
  assert.equal(v[0].modelName, 'Zen', 'sort must not mutate its input')
}
{
  const c: Conflict = { dutyId: 1, endMs: 0 }
  const d = [
    { name: 'Suresh', status: 'Unavailable' as DriverStatus, busy: c },
    { name: 'Mohan',  status: 'Assigned'    as DriverStatus, busy: null },
    { name: 'Priya',  status: 'Inactive'    as DriverStatus, busy: null },
    { name: 'Ramesh', status: 'Active'      as DriverStatus, busy: null },
  ]
  assert.deepEqual(
    sortDrivers(d).map(r => r.name),
    ['Mohan', 'Ramesh', 'Priya', 'Suresh'],
    'Assigned ranks with the clean rows — it is routine, not a warning',
  )
}

// ── status classification ─────────────────────────────────────────────────────
{
  assert.equal(isFlagged('Assigned'), false, 'Assigned is spoken-for, not unfit to drive')
  assert.equal(isFlagged('Inactive'), true)
  assert.equal(isFlagged('Unavailable'), true)

  // every status must land in exactly one non-'all' scope, or the counts lie
  const all: DriverStatus[] = ['Active', 'Inactive', 'Available', 'Assigned', 'Unavailable']
  for (const s of all) {
    const hits = (['pickable', 'assigned', 'flagged'] as const).filter(sc => inScope(s, sc))
    assert.equal(hits.length, 1, `${s} landed in ${hits.length} scopes`)
    assert.equal(inScope(s, 'all'), true)
  }
}

// ── search ────────────────────────────────────────────────────────────────────
{
  assert.equal(matches('', 'anything'), true, 'empty query matches everything')
  assert.equal(matches('   ', 'anything'), true)
  assert.equal(matches('ka01', 'Dzire', 'KA01 AB 1234'), true, 'case-insensitive across fields')
  assert.equal(matches('innov', 'Innova Crysta', null), true)
  assert.equal(matches('xyz', 'Innova Crysta', null), false)
  assert.equal(matches('a', null, undefined), false, 'null fields must not throw')
}

console.log('allotOptions.check.ts — all assertions passed')
