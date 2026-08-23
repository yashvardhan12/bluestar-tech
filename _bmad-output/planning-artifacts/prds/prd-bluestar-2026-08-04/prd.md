---
title: 'Blue Star Driver PWA — Product Requirements'
status: final
created: '2026-08-04'
updated: '2026-08-04'
---

# Blue Star Driver PWA

## 1. Why this exists

Blue Star's operator platform can take a booking, split it into duties, allot a
vehicle and a driver, and raise an invoice. Between "allotted" and "invoiced"
there is a hole, and the hole is the driver.

Today the duty leaves the system when the operator allots it. It travels by
phone call or WhatsApp. The kilometres come back on paper, or in a photo of
paper, or in someone's memory. The operator retypes them. `invoice.ts` reflects
this precisely: it sums `duties.base_rate` and stops, because — as its own
header comment says — the database holds `extra_km_rate` and `extra_hour_rate`
but no actual kilometres or hours, so extras cannot be computed. They get typed
in by hand as custom rows.

The driver app closes that loop. It puts the duty in the driver's hand, captures
what actually happened, and returns figures the invoice can be built from
without anyone retyping anything.

**The product thesis in one line:** the duty slip stops being paper.

## 2. Goals and success metrics

| Goal | Metric | Counter-metric |
|---|---|---|
| Kill manual km entry | % of completed duties with driver-captured start and end readings | Operator override rate — if operators keep correcting readings, the capture isn't trusted |
| Bill accurately | % of invoices whose extras are computed, not hand-typed | Invoice dispute rate must not rise |
| Bill faster | Median hours from duty close to invoiceable | Duties closed with missing data |
| Drivers actually use it | % of allotted duties started in-app rather than by phone | Support calls from drivers — a rise means the app is harder than calling |

That last counter-metric governs the design. A driver who finds this harder than
a phone call will use the phone, and the loop stays open.

## 3. Who this is for

**Primary: the driver.** Working from a phone, often an inexpensive Android, on
a cracked screen, one-handed, in bright sun or a dark basement. Sometimes
wearing gloves. Frequently on a bad connection. They are not looking at this
app; they are looking at traffic. Every interaction competes with driving.

**Secondary: the operator**, who never opens the driver app but whose screens
change because of it. Duty status stops being inferred from the clock and starts
reflecting what a driver actually did.

**Not a user: the passenger** — but they touch the device once, to sign. That
single interaction has to work with no explanation and no training, held out by
a driver at arm's length.

## 4. Scope

**In scope (v1)**

Driver authentication · duty lists (current, upcoming, completed) · duty detail
with navigation and passenger info · the duty lifecycle from start to close ·
odometer capture with photo evidence · passenger signature · driver expenses ·
fuel entries · profile and operator contact · offline write queue · the
operator-side and billing consequences of all of the above.

**Build order within v1**

Everything above is in scope, but the sixty-five requirements below are not
equally load-bearing. If the build runs long, cut from the bottom.

1. **The loop** — F1, F2, F3, F7, F8. Without all five there is no product:
   a driver signs in, sees the duty, runs it, and the figures reach the invoice.
   Nothing here is severable.
2. **Surviving contact with reality** — F6 (offline) and the expense half of F4.
   The loop works in good signal without these; drivers do not work in good
   signal. F6 is the first thing that will be missed in production.
3. **Adjacent value** — F5, and fuel entries (FR-39). Genuinely useful, but the
   duty-slip loop closes without them.

**Out of scope (v1)**

Live GPS tracking or breadcrumb trails. In-app chat. Driver-visible earnings,
payslips or rates. Leave and shift requests. Vehicle inspection checklists.
Multi-language — v1 ships English only. Push notifications (the app polls and
uses realtime while open).

## 5. The driver's day

**UJ-1 — Ramesh picks up his first duty.**
Ramesh drives for a Mumbai operator. At 5:30am he opens the app on his phone.
He has never had an account before — his operator created him as a driver and
told him his ID, `DR243652`, and a four-digit code over the phone. He types
both. He is in, and stays in; he does not sign in again tomorrow.

`Current` shows one duty: Lawyers Association, 9:00am, Reliance Mall to Phoenix
Mall, four passengers by name. A line reads *"Leave 1 hr before reporting
time."* He taps the maps link and drives.

**UJ-2 — Starting.**
At 8:30 he is at Reliance Mall. He taps `Start Duty`. The app asks for the
odometer reading and a photo of it. He types `45,120`, photographs the
speedometer, and taps `Submit and start`. The duty flips to `Duty started`.
Somewhere in an office he will never visit, his operator's booking board moves
to On-Going — not because it's 8:30, but because Ramesh said so.

He is also now marked present for the day. He did not do anything extra for
that to happen.

**UJ-3 — The run.**
Raj Gupta and three colleagues get in. Ramesh taps `Confirm pickup`. At a toll
plaza he pays ₹450, taps to add an expense, photographs the receipt. At the
second plaza, ₹300, same again. He does this at the plaza because at 7pm he will
not remember either number.

**UJ-4 — Closing.**
Phoenix Mall, 6:30pm. Ramesh taps `Close Duty`. The app asks for a signature
first — he turns the phone to Raj, who signs with a finger. Then the odometer:
`45,262`, and a photo. He taps `Close Duty`.

The duty moves to `Completed`. 142 kilometres and nine and a half hours are now
facts in the system, not a claim on a piece of paper in a glovebox.

**UJ-5 — The basement.**
Same evening, different duty: Ramesh closes out in an underground car park with
no signal. He signs, enters the reading, taps close. The app says *"Saved on
your phone — will sync when you're back online."* He drives up the ramp. The
data goes. He never thinks about it again.

## 6. Features and requirements

### F1 — Authentication and session

The operator generates a four-digit code when they create the driver and shares
it out of band. There is no self-service signup and no password.

- **FR-1** A driver signs in with their Driver ID and a four-digit code.
- **FR-2** The sign-in screen must state plainly that the code comes from the
  operator. It must not imply a code was just sent — nothing is sent.
- **FR-3** Sessions last 90 days, sliding — refreshed on each use. A driver who
  works weekly never signs in twice.
- **FR-4** Failed sign-in states are distinguishable: unknown ID, wrong code,
  and too many attempts each say something different and useful.
- **FR-5** After 5 failed attempts against a Driver ID within 15 minutes, that
  ID is locked for 15 minutes. `[ASSUMPTION: thresholds not specified by the
  user; chosen to blunt the FR-1 keyspace risk without stranding a driver who
  fat-fingers a code at 5am]`
- **FR-6** An operator can regenerate a driver's code, which invalidates the old
  one and ends that driver's sessions.
- **FR-7** A driver whose record is not `Active` cannot sign in.

### F2 — Seeing the work

- **FR-8** Three views: `Current`, `Upcoming`, `Completed`.
- **FR-9** `Current` shows the duty in progress, or today's next duty if none
  has started.
- **FR-10** `Upcoming` lists future allotted duties with a relative countdown
  (`In 30m`, `In 4hr`), which is how drivers actually reason about time.
- **FR-11** `Completed` lists past duties, most recent first, opening into the
  full record: actual start and end times, captured readings, and expenses.
- **FR-12** A duty shows: customer, who booked it, reporting date and time,
  start and end location with full addresses, passenger names, and any operator
  note.
- **FR-13** Each location offers a maps handoff.
- **FR-14** Duty detail shows a departure prompt derived from the duty's
  garage-start allowance.
- **FR-15** A driver sees only duties allotted to them.
- **FR-16** A driver never sees any rate, fare, or invoice figure.
  `[NOTE FOR PM]` This pulls against FR-34, which requires drivers to write
  expenses. `duties` carries `base_rate`, `extra_km_rate` and `extra_hour_rate`
  on the same row as the reporting time and addresses a driver needs, so a
  driver cannot be granted the table. Architecture must supply a restricted
  projection. See `addendum.md`.
- **FR-17** Every list has an empty state that names why it is empty and what
  the driver should do next. The empty `Current` state additionally shows the
  next upcoming duty if one exists.
- **FR-18** A newly allotted duty appears without the driver reinstalling or
  hard-refreshing.

### F3 — Running a duty

The lifecycle is a fixed forward sequence. Nothing here branches.

- **FR-19** `Start Duty` requires an odometer reading and a photograph of it.
  Neither is optional.
- **FR-20** Starting records the start timestamp and moves the duty to
  `On-Going`.
- **FR-21** Starting a duty marks the driver present for that date in
  `driver_attendance`, if not already marked.
- **FR-22** `Confirm pickup` records the pickup timestamp for the group. One
  action covers all passengers.
- **FR-23** `Mark no-show` ends the duty without a pickup, and requires a
  reason. `[ASSUMPTION: the Figma has the button with no follow-through; a
  no-show with no recorded reason is unbillable and unarguable, so a reason is
  required here. Not confirmed by the user.]`
- **FR-24** `Call passenger` dials a passenger from the duty.
- **FR-25** The duty's visible status changes at every transition, so the driver
  always has confirmation their tap landed.
- **FR-26** `Close Duty` runs signature → end odometer, in that order. The
  passenger is still in the car during the signature.
- **FR-27** The signature is drawn on the device and can be retaken before
  submission. Any passenger may sign; no attribution is captured.
- **FR-28** Closing requires an end reading and a photograph of it.
- **FR-29** End reading must exceed start reading. This is enforced, not
  advisory — it is the cheapest defence against a typo reaching an invoice.
- **FR-30** Closing records the end timestamp and moves the duty to `Completed`.
- **FR-31** A duty spanning several days takes **one** signature and **one**
  odometer pair, at the very end. Duration does not change the shape.
- **FR-32** Starting a duty more than 2 hours before its reporting time requires
  an explicit confirmation. `[ASSUMPTION: 2 hours chosen to sit outside the
  garage-start allowance so legitimate early starts pass unchallenged]`
- **FR-33** A completed duty is read-only to the driver. Corrections are the
  operator's to make.

### F4 — Money the driver spends

Drivers never see what the customer pays. They do record what they lay out.

- **FR-34** A driver can add an expense to the duty in progress, at the moment
  they incur it.
- **FR-35** An expense has a type, an amount, and a photograph of the receipt.
- **FR-36** Expense types cover any outlay — toll, parking, fuel, driver
  allowance, and other — not tolls alone.
- **FR-37** Expenses are listed on the duty and total visibly.
- **FR-38** An expense can be removed before the duty is closed.
- **FR-39** A driver can record a fuel entry from their profile: vehicle,
  litres, amount, odometer, receipt photograph.
- **FR-40** Driver expenses and fuel entries surface to the operator against the
  duty and the vehicle.

### F5 — Profile and support

- **FR-41** Profile shows the driver's name and ID.
- **FR-42** `Contact operator` calls the operating company directly. When
  something is wrong at 6am, a phone call beats a support ticket.
- **FR-43** `Fuel entries` opens the driver's fuel history and entry form.
- **FR-44** `Log out` ends the session and clears cached duty data from the
  device.

### F6 — Working without a connection

- **FR-45** The duty in progress remains readable with no connection.
- **FR-46** Every lifecycle action — start, pickup, signature, close, expense —
  is accepted offline and queued on the device.
- **FR-47** Photographs and signatures are held locally until they can be sent.
- **FR-48** The queue flushes automatically on reconnect, in order.
- **FR-49** The driver is told, in plain words, that their work is saved on the
  phone and will sync. Silence here causes repeat taps and support calls.
- **FR-50** Queued work survives the app being closed and the phone being
  restarted.
- **FR-51** `Upcoming` and `Completed` may degrade to an offline state; no
  billing depends on reading history without a connection.
- **FR-52** A queued action still unsent after 3 flush attempts raises a
  persistent banner naming the affected duty, with a manual retry. It is never
  silently dropped.

### F7 — What the operator sees

The driver app's whole purpose is what it does to the operator's screens.

- **FR-53** Duty status reflects driver-observed events where they exist, and
  falls back to the current clock-based inference where they don't.
- **FR-54** Existing automation must stop overriding observed reality: a duty is
  not `On-Going` because its reporting time passed if the driver never started,
  and is not auto-`Completed` because its end date passed if the driver never
  closed it.
- **FR-55** The operator sees captured readings, computed distance and duration,
  both odometer photographs, the signature, and expenses on the duty.
- **FR-56** The operator can correct any driver-entered figure, and corrections
  are attributed.
- **FR-57** A closed duty is immediately invoiceable. There is no approval gate
  in v1 — the passenger signature is the authority.
- **FR-58** Duties past their end date with no driver start, or started with no
  close, are listable as a distinct set on the operator's duty views.
- **FR-59** Once a duty's scheduled end has passed and it is still `On-Going`,
  the operator can close it themselves. Before that point they cannot — an
  in-progress duty belongs to the driver.
  Closing this way lets the operator enter the readings if they have them, from
  a phone call or the paper slip, and close without them if they do not. A duty
  closed with no readings invoices at base rate per FR-65. The closure is
  attributed to the operator, so a duty the driver never verified is always
  distinguishable from one they did.
  Nothing auto-closes. A duty stuck `On-Going` is a person's decision, not a
  timer's.

### F8 — Billing

This is where the app pays for itself.

- **FR-60** Distance run is derived from the odometer pair; duration from the
  start and end timestamps.
- **FR-61** Invoicing computes extra-kilometre charges from actual distance
  against the duty type's threshold and the duty's extra-kilometre rate.
- **FR-62** Invoicing computes extra-hour charges from actual duration against
  the package and the duty's extra-hour rate.
- **FR-63** Night and outstation charges apply from the duty type's rate card
  using observed times.
- **FR-64** Driver expenses are available as billable lines, each independently
  markable as billable or absorbed.
- **FR-65** A duty with no captured readings still invoices at base rate, as
  today. The app changes nothing for duties it never touched.
- **FR-66** All money arithmetic goes through the existing rounding helper, and
  the existing invoice self-check is extended to cover the new paths.

## 7. Non-functional requirements

**Field conditions.** Primary actions are reachable one-handed. Touch targets
suit a gloved thumb. The screen is legible in direct sunlight. The app is
installable to the home screen and launches without a browser chrome.

**Performance.** The current duty renders from cache within 500ms of app open,
before any network call resolves, and updates in place when the network answers.
A driver waiting on a spinner at 5:30am is a driver who calls the office.

**Data integrity.** Odometer readings, timestamps, signatures and photographs
are billing evidence. No path may silently discard them. Odometer photographs
are stored at no less than 1280px on the long edge — a disputed reading has to
be settleable from the image months later.

**Security and tenancy.** Drivers reach only their own duties and only within
their own company. Rate and financial columns are never exposed to a driver
session. Photographs and signatures are private and company-scoped.

**Accessibility.** Status is never carried by colour alone — a countdown pill
reads as text, not just red — because these screens are used in sunlight, on
cheap panels, by people glancing rather than reading. Text scales to 200%
without loss of function; contrast meets WCAG AA.

## 8. Consequences for the existing system

Stated as consequences, not solutions; mechanism belongs in architecture.

- `drivers` records need a link to an authenticated identity. They have none
  today.
- The role model admits only `Owner` and `Admin`. Drivers are neither.
- Tenant isolation resolves a company from the signed-in user's active company.
  A driver has no such membership, which — usefully — means existing policies
  return nothing to them by default rather than leaking.
- `duties` has no fields for observed times, readings, evidence or signature.
  Per FR-31 these are columns on the duty, not a child table.
- `duties` is tenant-scoped only through its parent booking.
- Booking and duty status automation currently infers from wall-clock time and
  must learn to defer to observed events.
- The invoice calculator takes only base rates and must learn to take distance
  and duration.
- Drivers must be denied rate columns while being permitted expense writes,
  which implies a restricted projection rather than a table grant.
- Fuel entries have an existing home; driver-submitted entries feed it.

## 9. Decisions and accepted risks

**Accepted:** A four-digit code with a ten-thousand-value keyspace, no rotation
schedule, and no expiry is weak authentication. Knowing a Driver ID reduces the
problem to guessing four digits. Rate limiting (FR-5) is the mitigation; it is
not a substitute for a stronger factor.

This was accepted deliberately for v1, in exchange for a sign-in a driver can
complete one-handed in a parking garage. Revisit on the first incident involving
driver data, or when a customer's security review asks.

**Decided:** No operator approval gate before invoicing. The passenger signature
carries the authority. Revisit if disputes appear.

**Decided:** No push notifications in v1. Realtime while open, poll on focus.

**Decided:** English only in v1. Noted as the most likely first regret given the
user population.

## 10. Open questions

None blocking. All five can be resolved during architecture.

- **OQ-1** Can an operator reassign a duty a driver has already started?
- **OQ-2** Should a driver see the vehicle they've been allotted, and does a
  mismatch matter for the odometer trail?
- **OQ-3** Does a no-show duty bill, and at what?
- **OQ-4** How long are signatures and odometer photographs retained?
- **OQ-5** Should the operator be alerted when a duty's reporting time passes
  with no driver start?

## 11. Later

Push notifications · Hindi and regional languages · live tracking · driver-visible
earnings · in-app operator chat · vehicle inspection checklists · leave requests ·
per-passenger pickup confirmation for multi-stop runs.

## 12. Glossary

Terms used identically throughout this document and binding on downstream work.

| Term | Meaning |
|---|---|
| **Booking** | What the customer orders. Carries the customer, the billing target and the rate card. One booking produces one or more duties. |
| **Duty** | One vehicle-and-driver assignment on a date range — the unit a driver actually executes and the unit this app operates on. Not a synonym for booking. |
| **Allotment** | The operator's act of attaching a vehicle and a driver to a duty. A duty without allotment cannot appear in the driver app. |
| **Duty slip** | Traditionally the paper the driver carries and the passenger signs, recording start and end odometer and times. In this product it is the set of driver-captured fields on the duty; there is no separate record. |
| **Reporting time** | When the driver must be at the start location — not when they leave. |
| **Garage start** | The allowance before reporting time for travelling from the garage. Drives the "leave N hours before" prompt. |
| **Outstation** | A duty leaving the home city, usually spanning several days. Takes one signature and one odometer pair regardless of duration (FR-31). |
| **Duty type** | The rate-card template — thresholds, per-kilometre and hourly bands, night and outstation charges — that decides how a completed duty prices. |
| **P2P / GTG** | Point-to-point and garage-to-garage: how a duty type measures its billable span. |
| **Operator** | The fleet company running Blue Star. Employs the drivers, bills the customer. |
| **Passenger** | The person travelling. Named on the duty, and the party who signs at close. Never a user of this app. |

## 13. Assumptions index

Inferences not confirmed by the user. Each appears inline at the requirement it
affects; all are cheap to overturn.

| Ref | Assumption |
|---|---|
| FR-5 | Rate limit of 5 attempts per Driver ID per 15 minutes, then a 15-minute lock. |
| FR-23 | `Mark no-show` requires a recorded reason. |
| FR-32 | The early-start confirmation threshold is 2 hours before reporting time. |
