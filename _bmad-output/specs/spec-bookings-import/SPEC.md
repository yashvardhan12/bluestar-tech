---
id: SPEC-bookings-import
companions:
  - field-mapping.md
  - duty-type-matrix.md
  - safeguards.md
  - sample-baseline.md
  - ../../project-context.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Bookings Import

## Why

A pain to solve. Blue Star's corporate clients settle trips by sending a monthly
export — one row per day of travel, 261 bookings and 1,073 duties in the sample.
Today an operator re-keys those into the booking form one at a time, or they
never enter the system at all and the work cannot be invoiced through Blue Star.
Manual entry stays the primary flow for forward bookings; this exists to absorb
the settlement backlog so it becomes billable.

The file is a client artifact, not a Blue Star template, and it cannot be
changed. It arrives with two faults that silently corrupt data if imported
naively: `Trip ID` looks like the booking key but merges distinct bookings, and
9% of rows carry their start and end times reversed, which selects the wrong
hourly rate slab. Both are handled here, once, rather than discovered later in
an invoice.

## Capabilities

- id: CAP-1
  intent: An operator can select a client trip export and see what it contains before anything is written.
  success: Selecting the sample file reports 261 bookings and 1,073 duties, and a file missing any expected column is rejected by name with nothing analysed.

- id: CAP-2
  intent: Rows are grouped into bookings by the key that actually identifies one, so two customers' journeys never merge.
  success: Grouping the sample yields 261 groups with no group containing conflicting trip start dates; grouping by `Trip ID` would yield 251 with 8 conflicts.

- id: CAP-3
  intent: Each duty's start and end are resolved per row against the client's stated duration, so reversed times and midnight crossings are each repaired correctly.
  success: `resolveDutyTimes` classifies the sample as 972 coherent, 99 swapped, 0 rolled, 2 ambiguous; identical clock times resolve to `swapped` or `rolled` purely on stated hours; ambiguous rows are excluded rather than guessed.

- id: CAP-4
  intent: Sheet values are matched to existing reference records without ever creating one.
  success: Customers resolve on the GSTIN embedded in `customers.name`; a run against the sample reports 17 unresolved customers and creates no customer, duty type or location row. A car type with no matching vehicle group (`Superium Deluxe`) is reported as unresolved rather than guessed at.

- id: CAP-5
  intent: An operator sees what is blocked, grouped by cause and ordered by how many bookings each cause holds up, and can import the resolvable remainder.
  success: The report names each missing reference with its affected booking count, and the import action stays enabled while blocked rows exist.

- id: CAP-6
  intent: Re-running the same file after adding missing reference data imports only what newly resolves.
  success: A second run of an unchanged file creates zero bookings; after one customer is added, exactly that customer's bookings are created and no existing booking is duplicated or modified. A booking left duty-less by an interrupted run gains its duties on re-run; one whose file carries days it does not have is reported rather than skipped. Two sheet rows for the same day of the same trip collapse to one duty.

- id: CAP-7
  intent: Imported bookings are created through the same path as manually entered ones, so duties, passengers and derived status behave identically.
  success: A booking created by import and one created in the drawer produce the same row shape; imported duties carry no vehicle, no driver and no written status, and read `Booked` through `duties_status` until an operator allots them.

## Constraints

- `booking_ref` takes the sheet's `Travel ID`. The existing `bookings_booking_ref_key` UNIQUE constraint is the entire idempotency mechanism; no separate import-state table exists.
- Grouping is by `Travel ID`, never `Trip ID`.
- `duties.reporting_time` and `est_drop_time` come from `resolveDutyTimes`, never straight from the sheet columns.
- The import writes no money. `duties.base_rate` is left null and the system derives the amount once duties complete. `Total amount`, `Revenue amount`, `Toll Tax` and `Parking Charge` are read past, not stored.
- Customers match only on the GSTIN embedded in `customers.name`. `customers.gstin_number` is the billing GSTIN and is permitted to differ. Company name is not a key — one name spans seven tax entities.
- The importer writes no `status`. `duties_status` and `bookings_status` derive it.
- The importer sets no `company_id`. It defaults to `current_company_id()` and is immutable once written, so a wrong-tenant import is unrecoverable.
- No reference record is ever created by the import: not customers, duty types or locations.
- `Daily Journey Vehicle Number` is not imported. The plates in the export are placeholders; allotment is an operator action on the created duties, and `duties.vehicle_id` stays null.
- Every Supabase call destructures and handles `error`; they are returned, not thrown.
- The re-run skip test is "booking exists, has duties, **and** the file adds no new days", never `booking_ref` alone. Two failures hide under a blanket skip: an interrupted run leaves a booking with no duties, and a long trip split across monthly exports (5 of 261 sample trips span a calendar month, one across four) would lose every day after the first file. Neither is repaired silently — the second is reported, not merged.
- All sheet cells are text; dates are `dd-mm-yyyy`. SheetJS `cellDates` has no effect.
- Verification is one runnable `src/lib/*.check.ts` using `node:assert`. No test framework is installed and none is being added.

## Non-goals

- Importing drivers or vehicles. The file has no driver column at all, and its vehicle numbers are placeholders — both are set by allotment afterwards.
- Importing distance or odometer readings. `Daily Journey Distance` is 97% null and is a distance, not the absolute reading pair the schema stores.
- Closing duties as part of import. Operators close them in the system by hand. Odometer values cannot be recovered for past trips anyway, and writing `closed_at` removes the Close action from exactly the rows an operator might later have evidence for.
- Inline creation of customers or duty types from the import screen. Each needs fields the sheet does not carry; the Database pages already exist and are deep-linked instead.
- A column-mapping UI or a downloadable template. The export is system-generated with stable headers.
- Importing money. Amounts are derived by the system when a duty, or all duties in a booking, complete — the sheet's settled figures are not carried across.
- Speeding up forward booking entry. That remains the manual drawer.
- Refereeing dates against the `Month` column. It is the settlement month, lagging travel by up to three months.
- Any UI flow for resolving arithmetically ambiguous duty windows. They are listed at the end of the report and left to the operator's judgement.
- Merging new duties into a booking that already exists. Widening its dates and reconciling against existing allotments is a separate action; the import reports the gap instead.
- De-duplicating on booking *details*. Travel ID is the client's key — two different ones are two different bookings, even when customer, route and dates match.

## Success signal

An operator imports a monthly client export, sees 17 named customers blocking 139 bookings, adds them over a day in Database, re-runs the same file, and every booking lands exactly once with no duplicates. The bookings then appear in the billing picker, ready to be allotted and closed like any other.

## Assumptions

- Newer exports contain a mix of reversed-time and genuine midnight-crossing rows, per the user; the sample contains only the former.
- Every imported duty lands unallotted, so all 1,073 enter the allotment queue at once. This is intended — allotment is the operator's next step — but it is a large queue arriving in one action.

## Open Questions

None outstanding. Resolved 2026-08-29 — see `.decision-log.md`.
