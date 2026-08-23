# Allowances — implementation plan

Status: agreed 2026-08-19. Verified against the live database, not `supabase/migrations/`.

## The one rule that makes this simple

**Quantity is computed once. Two rates hang off it.**

- **Driver side** — computed for every *active* allowance whose trigger fires. Rate is
  `allowances.driver_rate`, one company-wide number per allowance.
- **Customer side** — exists **only** where the operator added that allowance to the duty
  type. No `duty_type_allowances` row → the driver is still paid, the customer is never
  charged.

Selecting allowances on a duty type is therefore purely the *billing* switch. It has no
effect on driver payout. This resolves Extra Duty (driver-only until someone prices it on a
duty type) and every other "is this chargeable" question with one mechanism.

## The nine allowances

| code | name | unit | qty | trigger |
|---|---|---|---|---|
| `daily` | Daily Allowance | day | days spanned (inclusive) | always |
| `overtime` | Overtime Allowance | hour | `ceil(mins past baseline end / 60)` | actual end past baseline |
| `outstation` | Outstation Allowance | day | days spanned | `duty_types.category = 'Outstation'` |
| `outstation_overnight` | Outstation Overnight | night | nights spanned | outstation **and** spans a night |
| `off_day` | Off-Day Allowance | duty | 1 | start weekday = `drivers.off_day` |
| `early_start` | Early Start Allowance | hour | `ceil(mins before baseline start / 60)` | actual start before baseline |
| `night` | Night Allowance | night | nights spanned | `end_date > start_date` |
| `extra_duty` | Extra Duty Allowance | duty | 1 | driver's 2nd+ duty that calendar day |
| `airport` | Airport Allowance | duty | 1 | `category = 'Airport'` or `bookings.is_airport_booking` |

Decisions baked in:

- **Night and Outstation Overnight stack.** An overnight outstation duty pays both,
  deliberately — overnight covers lodging, night covers extended hours.
- **Daily Allowance is always on top of salary**, monthly or daily wage, no branching.
- **Hours round up per started hour, no grace.** One minute past → one full hour. Zero or
  negative → no line at all.
- **Days = date diff + 1. Nights = date diff.**
- **Extra Duty** attributes 1 to each duty after the first, ordered by `reporting_time`.
  Three duties in a day → qty 1 on the 2nd and 1 on the 3rd.
- **Off day is derived from the weekday**, because `driver_attendance.status` only allows
  `'P'`/`'A'` — there is no "Off" marker to read.

### The OT / Early Start baseline

`allowances.baseline` — `'duty_window'` | `'driver_shift'`, set per allowance from the
Allowances page. Only `overtime` and `early_start` read it.

- `duty_window` — measured against the duty's own `reporting_time` / `est_drop_time`.
  Works today with no data entry.
- `driver_shift` — measured against `drivers.shift_start_time` / `shift_end_time`.
  **These are NULL for every driver in production.** When NULL, fall back to
  `duty_window` — otherwise the allowance silently pays nothing.

## Schema — three tables

```sql
allowances                    -- master list, per company, seeded with the nine
  id, company_id, code, name,
  unit        text  -- 'day' | 'hour' | 'duty' | 'night'
  baseline    text  -- 'duty_window' | 'driver_shift', only read by overtime/early_start
  driver_rate numeric
  is_active   boolean
  unique (company_id, code)

duty_type_allowances          -- which allowances a duty type charges, and at what price
  duty_type_id, allowance_id, customer_rate
  primary key (duty_type_id, allowance_id)
  -- no company_id: scoped through duty_type, per the tenancy rule

duty_allowances               -- THE SNAPSHOT
  id, duty_id, allowance_id, qty,
  customer_rate, customer_amount,
  driver_rate,   driver_amount,
  source text,   -- 'auto' | 'manual'
  created_at
  unique (duty_id, allowance_id)
  -- no company_id: scoped through duty → booking, same as duties itself
```

`duty_allowances` is the load-bearing table. **Rates are copied at compute time** so editing
the rate card next month cannot silently rewrite an invoice already sent. It is also what
makes the duty-type problem below survivable — the type name is resolved once, at snapshot
time, and never consulted again.

RLS follows the existing indirect pattern. No `company_id` on the child tables, no
`.eq('company_id', …)` in any query.

## Known landmine, independent of this feature

`duties.duty_type` is **free text**, and `duty_types.type_name` has **no unique index** —
not per company, not at all. `DutySlipDrawer.tsx:179` already resolves the rate card with
`.eq('type_name', d.duty_type).maybeSingle()`, which returns `null` when two types share a
name. Hanging a rate card off `duty_type_id` while duties reference the type by name means a
rename detaches the pricing.

Fix before phase 5: add `unique (company_id, type_name)` on `duty_types` and resolve
`duty_type_id` at snapshot time. Six duty types exist in production, so the constraint will
apply cleanly.

## Compute lifecycle

Duties are closed by the `driver_close_duty` Postgres RPC from the driver app. **Do not
touch it.** Computing there would need new driver-side RLS on `duty_allowances` for no gain.

Instead, snapshot lazily on the operator side:

1. Opening the duty slip drawer, or adding a booking to an invoice, calls
   `syncDutyAllowances(dutyId)`.
2. It computes and upserts rows that don't exist yet.
3. Rows with `source = 'manual'` are **never** overwritten by a recompute.
4. Once `duties.status = 'Billed'`, recompute is skipped entirely. The snapshot is frozen.

Syncing at both the slip drawer *and* invoice-build time covers the case where an invoice is
raised without anyone opening the slip.

## Build order

| # | What | Where |
|---|---|---|
| 1 | Migration: three tables, RLS, seed the nine per company, `duty_types` unique index | new migration |
| 2 | `computeAllowances()` — pure, no React, no Supabase + `allowances.check.ts` | `src/lib/allowances.ts` |
| 3 | Master CRUD: name, unit, driver rate, baseline, active | `src/pages/database/AllowancesPage.tsx` (currently a stub) |
| 4 | Allowance picker + customer price inputs in the duty-type drawer | `src/pages/database/DutyTypesPage.tsx` |
| 5 | `syncDutyAllowances()`; replace the hardcoded `ALLOWANCE_ROWS` with real amounts, editable until Billed | `src/pages/bookings/DutySlipDrawer.tsx:22` |
| 6 | `bookingAmount()` = base_rate + allowance customer_amount; itemise on the printed invoice | `src/lib/invoice.ts`, `src/pages/billing/CreateInvoicePage.tsx` |
| 7 | Allowances column becomes a computed sum with a per-allowance breakdown drawer | `src/pages/driver-ops/PayrollPage.tsx` |

Phases 1–2 carry all the risk. 3–7 are plumbing.

The money path means **phase 2 ships with a runnable check** and phase 6 updates
`invoice.check.ts`:

```
node --experimental-strip-types src/lib/allowances.check.ts
```

## Notes for whoever picks this up

- `driver_payroll.allowances` is a single lump-sum column with 0 rows in it today. Keep the
  column as the stored month total (so a Paid payroll stays a snapshot) and derive the
  breakdown by joining `duty_allowances` through `duties` for that driver and month.
- The comment at the top of `src/lib/invoice.ts` claiming no hours are recorded is **stale**.
  `duties.started_at` / `closed_at` are populated by the driver app. Fix it in phase 6.
- `DutySlipDrawer.tsx` already names eight of the nine rows. Airport is the one missing.
- Production data is tiny — 6 duty types, 4 duties, 2 drivers, 0 payroll rows, 1 invoice.
  There is no migration burden here; get the shape right rather than the backfill.
