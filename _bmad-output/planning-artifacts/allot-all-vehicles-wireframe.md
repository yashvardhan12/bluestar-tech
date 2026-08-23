# Assign Vehicle — "All vehicles" escape hatch

**Surface:** `src/pages/bookings/AllotDrawer.tsx`, Step 1 only (660px drawer).
**Callers unaffected:** AllBookingsPage (bulk), BookingDetailPage (single + driver-only), AllDutiesPage.

## Problem

Step 1 today applies two filters silently and simultaneously:

1. **Group** — `vehicle_groups.name = duty.vehicleGroup`
2. **Time** — vehicle has no overlapping non-cancelled duty

When the correct answer is "put the Innova on it even though it's a Sedan booking" or
"this vehicle finishes at 14:00 and the duty starts at 18:00 but the data says otherwise",
the operator has no way through. Today they close the drawer and edit the booking's
vehicle group, which corrupts the booking to work around a UI limit.

## Design decision

**One control, not two.** A single segmented toggle drops *both* filters together.
Two independent checkboxes (group / availability) is the "correct" model but it's four
states for a screen that has exactly two real modes: the safe default, and "show me
everything, I know what I'm doing."

---

## Wireframe A — default mode (unchanged, plus the toggle)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Assign Vehicle                                                       [X]  │
│  Showing Sedan vehicles that are free during this duty.                    │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Duty ID                                                       1042   │  │
│  │ Start Date                                             12 Aug 2026   │  │  ← unchanged
│  │ Vehicle Group                                                Sedan   │  │
│  │ …                                                                    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌────┐  Available vehicles              ┌───────────────┬──────────────┐  │
│  │ 🚗 │  Tap a vehicle to select it.     │ ●Sedan · free │ All vehicles │  │  ← NEW
│  └────┘  Drivers already on a vehicle    │      (6)      │     (41)     │  │
│          are shown below it.             └───────────────┴──────────────┘  │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Model name              │ Assigned driver      │ Vehicle number      │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │ Dzire                   │ (RK) Ramesh K.       │ KA01 AB 1234        │  │
│  │ Etios                   │ —                    │ KA01 CD 5678        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                            [ Cancel ]  [    Next    ]      │
└────────────────────────────────────────────────────────────────────────────┘
```

Segmented control sits on the section header row, right-aligned. Counts are live, so the
operator sees "6 vs 41" before deciding to widen — that number *is* the affordance.

---

## Wireframe B — "All vehicles" mode

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Assign Vehicle                                                       [X]  │
│  Showing every vehicle. Ones outside Sedan or already on a duty are        │  ← subtitle swaps
│  marked.                                                                   │
├────────────────────────────────────────────────────────────────────────────┤
│  … duty info table (unchanged) …                                           │
│                                                                            │
│  ┌────┐  All vehicles                    ┌───────────────┬──────────────┐  │
│  │ 🚗 │  Free vehicles first. Busy ones  │  Sedan · free │ ●All vehicles│  │
│  └────┘  can still be picked.            │      (6)      │     (41)     │  │
│                                                                            │
│  ┌ 🔍 Search model or number ─────────────────────────────────────────── ┐ │  ← NEW, this mode only
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Model name              │ Assigned driver      │ Vehicle number      │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │ Dzire                   │ (RK) Ramesh K.       │ KA01 AB 1234        │  │  free, in group
│  │                         │                      │                     │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │ Innova Crysta           │ —                    │ KA01 EF 9012        │  │  free, other group
│  │ ⌞ SUV                   │                      │                     │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │▏Etios                   │ (SP) Suresh P.       │ KA01 CD 5678        │  │  BUSY — muted text,
│  │▏⌞ Sedan                 │                      │ ⌞ ● Busy till 18:30 │  │  amber dot, still tappable
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │ Fortuner                │ —                    │ KA02 GH 3456        │  │
│  │ ⌞ SUV                   │                      │ ⌞ ● Busy till 21:00 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│  ⚠ Etios (KA01 CD 5678) is on duty 1032 until 18:30. Assigning it          │  ← only when a BUSY
│    double-books the vehicle.                                               │     row is selected
│                                            [ Cancel ]  [ Assign anyway ]   │  ← label swaps
└────────────────────────────────────────────────────────────────────────────┘
```

### Row anatomy in All mode

No new columns — the drawer is 660px and a 5-column grid would crush the model name.
Two sublines carry the extra state instead:

| Cell | Subline | Shown when |
|------|---------|------------|
| Model name | `⌞ SUV` — group name, `text-xs text-gray-500` | vehicle's group ≠ duty's group |
| Vehicle number | `⌞ ● Busy till 18:30` — `text-xs text-warning-600` | vehicle overlaps the duty window |

Row height grows `72px → 88px` only for rows that carry a subline.

### States

- **Free, in group** — identical to today. No chips.
- **Free, other group** — group chip only. Silent, no warning: cross-group allotment is a
  normal upgrade/downgrade, not a mistake.
- **Busy** — model name and number drop to `text-gray-400`, amber status subline, row still
  clickable. Selecting one arms the footer warning and relabels the primary button.
- **Selected + busy** — amber selection tint (`bg-warning-25`, `border-l-warning-500`)
  instead of the violet used for safe picks. The colour tells you what you're about to do.

### Ordering

Free before busy; within each, duty's own group before other groups; then model name.
One comparator, sorted client-side after fetch.

### Empty states

- Default mode, 0 rows — existing copy, plus: *"Switch to **All vehicles** to see the
  other 35."*  The dead end becomes a doorway.
- All mode, 0 rows after search — *"No vehicle matches "innov"."*

---

## What the data layer needs

Three changes to the existing query in `AllotDrawer.tsx`:

1. Drop `.eq('vehicle_groups.name', …)` in All mode; keep the join to read the group name
   (today `vehicleGroup` is hardcoded from `duty.vehicleGroup` because the filter guaranteed it).
2. Don't discard busy vehicles — annotate them. `busyByVehicle` already holds the intervals;
   `isFree()` becomes a flag on the row instead of a `.filter()`.
3. Add `id` and `booking_id` to the busy-duty select so the warning can name the duty.

Both modes come from **one fetch**. Fetch everything once, filter in memory when the toggle
flips — no refetch, no spinner on toggle, and the "(6)" / "(41)" counts are free.

---

## Open questions

1. **Drivers (Step 2) have the identical constraint** — `status IN ('Active','Available')`
   AND free during the window. Same dead end, same workaround pressure. Mirror the toggle
   there in this pass, or ship vehicles first?
2. **Does a double-booking need to be recorded?** Right now it would just be two duties on
   one vehicle with no marker. Fine if allotment is a human judgement call; not fine if
   anything downstream (duty slips, payroll) assumes one-vehicle-one-duty.
3. **`driverOnlyMode`** skips Step 1 entirely and reuses the existing vehicle. Untouched here.
