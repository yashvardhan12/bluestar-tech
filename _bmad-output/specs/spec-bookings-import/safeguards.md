# Safeguards — keeping the sheet from polluting the system

## Already in the database — do not undo

| Guard | Stops |
|---|---|
| `bookings_booking_ref_key` UNIQUE | duplicate bookings on re-import. **The entire idempotency strategy** |
| `bookings.company_id` default + `guard_company_id` trigger | cross-tenant leakage; unrecoverable if wrong, since the column is immutable |
| `duties_booking_id_fkey ON DELETE CASCADE` | orphan duties, and makes an import batch reversible |
| `duties_dates_forward` / `bookings_dates_forward` (032) | a backwards window reaching the table |
| `locations_name_trimmed` + citext unique (031) | casing and whitespace twins in a table shared by every tenant |
| `bookings_status_check` / `duties_status_check` | invalid status strings |
| `set_booking_ref()` + `booking_ref_seq` (032) | the manual `BK-#####` series being dragged to `BK-60082454` by an imported Travel ID |

## Preflight — before a single write

1. **Validate the header row.** Hardcoded column names read `undefined` silently if the client renames one. Fail loudly, naming what is missing, and analyse nothing.
2. **Confirm the active company by name on screen.** `company_id` is immutable; a wrong-tenant import can only be deleted, never moved.
3. **Resolve every duty window through `resolveDutyTimes`**; exclude `ambiguous` rows.
4. **Check `tripWindowViolation`** — each duty must sit inside its own trip, with one day of allowance on the end for a midnight crossing.
5. **Sanity-cap duties per booking.** One legitimate trip has 121; a grouping bug produces thousands.
6. **Report every unresolved reference** with its affected booking count.

## Never auto-create

The largest pollution vector, and it applies to all four:

- **Locations** — shared across tenants. One sheet typo becomes every tenant's dropdown entry permanently.
- **Customers** — one company name spans seven GSTINs; auto-creating merges tax entities and mis-bills.
- **Duty types** — they carry the rate card; a stub prices at zero.
- **Vehicles** — not touched at all. The export's plates are placeholders; `vehicle_id` stays null until an operator allots.

## Write path

8. **Never write `status`** — the views derive it; writing fights them.
9. **Never set `company_id`** — the default handles it.
10. **Check every Supabase error.** Returned, not thrown; silent failure has already shipped a bug here (`d47d8fc`).
11. **Write no money.** `base_rate` stays null; amounts are derived on completion.
12. **The skip test is "booking exists AND has duties."** Never `booking_ref` alone. There is no client-side transaction across `bookings` → `duties` → `booking_passengers`, and one import is ~700 sequential round trips over several minutes — a closed lid or a dropped connection leaves exactly one in-flight booking with its row written and no duties. Skipping on the ref alone strands it: invisible in Duties, un-allottable, invoicing as zero. Testing for duties too makes the re-run repair it. No RPC needed.

## After

13. **Summary** — created, skipped, blocked, with the per-cause counts.
14. **Undo is** `delete from bookings where booking_ref in (…)`; duties cascade.

## Withdrawn

Refereeing parsed dates against the `Month` column. `Month` is the settlement
month, lagging travel by 0, 1 or 3 months, and raised 192 false alarms on
correct data. Nothing in the file can referee `dd-mm` against `mm-dd`; the
defences are calendar validation in `parseSheetDate` (which catches `13-01`,
`31-02`, `29-02-2025`) and trip-window containment.
