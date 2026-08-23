# Addendum — Driver PWA

Mechanism, technical-how, and rejected alternatives. Deliberately kept out of
`prd.md`, which states capabilities. This is input to
`bmad-create-architecture`, not a substitute for it — nothing here is a
final architectural decision.

## Authentication mechanism

Supabase Auth has no "identifier + PIN" provider, so FR-1 cannot be met by a
built-in flow. The shape that fits the existing system:

- Drivers become real `auth.users` rows so that RLS applies to them at all.
- They are **not** given a `company_members` row. This is the load-bearing
  detail: `current_company_id()` returns null for them, so every existing
  `company_id = current_company_id()` policy returns zero rows automatically.
  Driver access is then additive — explicit policies on the few tables they
  need — and no existing policy has to be rewritten or audited.
- `drivers` gains a nullable link to the auth identity. Nullable because not
  every driver record needs a login.
- An Edge Function validates Driver ID + code and mints a session. The code is
  stored hashed, never in plaintext. Rate limiting (FR-5) lives here, keyed on
  Driver ID, and this is also the natural place to enforce FR-7.
- FR-6 (regeneration) means rotating the stored hash and revoking sessions.

**Rejected: adding a `'Driver'` value to the role enum and a `company_members`
row.** It would grant drivers every `company scoped` policy in the database —
customers, payroll, invoices, other drivers' salaries — and would require
rewriting every policy to exclude them. The no-membership approach gets the same
isolation for none of the work.

**Rejected: phone OTP.** A better security story and a natural fit for the
`drivers.phone` column already present, but it costs per message and adds an SMS
provider dependency. Worth revisiting when the PIN risk in §9 is revisited.

**Rejected: client-side PIN check.** No Supabase JWT means no RLS, which means
no tenancy enforcement at all.

## Schema shape

FR-31 (one slip per duty regardless of duration) is what makes this simple:
observed values are **columns on `duties`**, not a child table.

Roughly: started / pickup / dropped / closed timestamps; start and end odometer
readings; storage paths for the two odometer photographs and the signature; a
no-show reason. Distance and duration are derived, not stored.

`duties` has no `company_id` — it is tenant-scoped through
`booking_id → bookings.company_id`, and its existing policy leans on the
bookings policy. Any driver-facing policy has to respect that indirection.

Expenses and fuel have existing homes (`driver_expense_logs`, `fuel_logs`);
driver-submitted rows feed them rather than introducing new tables.

FR-16 (drivers never see rates) plus FR-34 (drivers write expenses) means a
driver cannot simply be granted `duties`. A restricted projection — a view or
column-level policy — is required, since `duties` carries `base_rate`,
`extra_km_rate` and `extra_hour_rate` on the same row as the operational fields
the driver needs.

## Offline queue

Chosen because driver-entered readings are billing inputs and must never be lost
(a failed write plus a closed app equals a lost duty slip), while full offline
sync is unnecessary: **these fields are single-writer.** Only the assigned
driver writes them, so there is no merge conflict to resolve. That is the entire
reason the cheap version is safe here and would not be safe elsewhere.

Shape: IndexedDB queue of intents, photographs and signatures held as blobs,
flushed in order on reconnect, surviving app close and device restart (FR-50).
Actions must be idempotent so a replayed flush cannot double-apply. `Upcoming`
and `Completed` deliberately do not participate.

**Rejected: full offline mirroring with conflict resolution.** Large build, no
conflicts to resolve.

**Rejected: naive retry without persistence.** Loses data the moment the app is
closed — the exact scenario FR-45 to FR-52 exist to prevent.

## Status automation rework

FR-53 and FR-54 are a change to existing behaviour, not an addition.
`src/lib/bookingStatus.ts` currently derives status from wall-clock time and
`vehicle_id`: `computeDutyStatus` flips a duty to `On-Going` once its reporting
time passes, and `syncCompletedDuties` auto-completes any `On-Going` duty whose
`end_date` is in the past.

Both become wrong the moment drivers report reality. The functions must prefer
observed timestamps and fall back to inference only where none exist. Every
caller routes through these two functions, so the fix belongs there rather than
at the call sites.

`syncCompletedDuties` does not merely change — it **goes away** as an automatic
process. FR-59 replaces it with an operator action that unlocks once a duty's
scheduled end has passed. That removes the only current mechanism for closing a
forgotten duty, so FR-58's list is what stops those duties going unnoticed; the
two requirements have to ship together or duties will silently stop being
invoiced.

## Invoicing

`src/lib/invoice.ts` is pure and framework-free, with a runnable self-check at
`src/lib/invoice.check.ts` — extend both rather than introducing a test
framework.

`CalcDuty` currently carries `baseRate` alone. It needs distance, duration and
the applicable thresholds and rates so `bookingAmount` can return base plus
computed extras. The `duty_types` rate card (`threshold_km`, `rate_per_km`,
hourly bands, `night_charges`, `daily_outstation_charges`) is fully populated
and entirely unused at invoice time today.

FR-65 matters for rollout: duties with no captured readings must continue to
invoice exactly as they do now, so the change is safe to ship before every duty
flows through the app — and it is what makes an operator-closed duty (FR-59)
bill sanely when no readings were recoverable.

## Client and delivery

One route tree (`/driver/*`) inside the existing Vite app rather than a second
repository — same Supabase client, same types, same deploy. A PWA plugin
supplies manifest and service worker.

The operator shell must not render for driver sessions, and the driver shell
must not render for operators.

## Storage

Odometer photographs and signatures go to the existing `documents` bucket, which
is already private and company-scoped. Drivers need write access scoped to their
own duties. Retention (OQ-5) is unanswered and has both cost and evidentiary
consequences — these images are what settle a billing dispute.
