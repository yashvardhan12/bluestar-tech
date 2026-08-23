---
name: Close Duty
description: Behavioural specification for operator-side duty closure — the eight capture states an operator can arrive at, what the modal asks for in each, and the refusals that keep a signed record from being overwritten by a remembered one.
status: final
updated: 2026-08-23
inherits: ../ux-bluestar-2026-07-31/EXPERIENCE.md
design: ./DESIGN.md
sources:
  - ../../prds/prd-bluestar-2026-08-04/prd.md          # FR-53 → FR-60, FR-65
  - ../../prds/prd-bluestar-2026-08-04/addendum.md     # FR-58/FR-59 shipping dependency
  - ./mockups/close-duty-wireframe.html
---

# Close Duty — Experience Spine

## Foundation

**Form factor:** desktop web, operator side. The driver-facing counterpart already
exists as a mobile PWA at `/driver/*` and is untouched by this.

**UI system:** Untitled UI via `src/styles/tokens.css`. Visual identity is
{DESIGN.md}; this document owns behaviour only.

**The premise that shapes everything:** 27 of 31 drivers have no `auth_user_id` and
cannot open the driver app. `closed_at`, `end_odo`, `end_odo_photo` and
`signature_path` have exactly one writer — `driver_close_duty`, gated on
`current_driver_id()`. For 87% of the fleet that writer is unreachable, so **operator
close is the primary capture path, not a fallback.** Design for volume, not for
exceptions.

**The operator's actual posture:** on the phone to a driver, or holding a paper slip.
They are transcribing, not reviewing. Every decision below follows from that.

## Information Architecture

Close Duty is an action on a duty, never a destination. It has no route and no
back-stack presence.

| Entry point | Condition | Notes |
|---|---|---|
| All Duties → row actions | `closed_at IS NULL` and status not `Billed`/`Cancelled` | Sits above the Cancel divider |
| Booking Detail → duty row actions | same | The `On-Going` branch that until now returned an empty menu |
| All Duties → "Needs closing" filter | `effective_status IN ('Completed','On-Going') AND closed_at IS NULL` | FR-58. Ships with this or the rows are unfindable |

**Gate on `closed_at`, never on status.** A back-dated allotment reads `Completed`
while carrying an empty slip; status-gating would hide the action from precisely the
rows that need it.

## Voice and Tone

Plain, specific, and never scolding. The operator is doing salvage work with imperfect
information — the interface's job is to make that easy and honest, not to imply they
should have had better data.

| Situation | Say | Not |
|---|---|---|
| Blank record | "Nothing was recorded in the driver app. Ramesh has no app login — enter what he reports." | "No data available" |
| Driver started only | "Suresh started this duty at 07:04 and did not close it. Ask him for the drop time and closing reading." | "Incomplete duty record" |
| Backwards reading | "Must be more than the start reading of 45,120 km." | "Invalid value" |
| No readings | "This duty will invoice at base rate. With no odometer pair there is no extra-kilometre charge to calculate." | "Warning: missing data" |
| Provenance | "Recorded by you from the driver's report — no odometer photograph, no passenger signature." | A badge reading "MANUAL" |

Name the driver wherever there is one. "Ramesh has no app login" tells the operator
something actionable; "the driver has no login" reads as a system complaint.

## Component Patterns

### Locked field block

Driver-captured figures render read-only with their evidence chip. Visual spec in
{DESIGN.md}. Behaviour:

- Never focusable, never a form control. It is not a disabled input.
- Each billing-relevant row carries a **Correct** link. Following it is FR-56
  correction — a distinct, attributed action writing `corrected_by` / `corrected_at`.
- Rows with no billing consequence (pickup time) carry no Correct link. There is
  nothing to correct them *to*.
- The evidence chip opens a signed URL, 300s expiry, per the existing storage
  helper.

**Why closing and correcting must stay separate:** FR-57 makes the passenger
signature the authority. If one gesture both closed a duty and silently overwrote the
driver's figures, no record would carry a trustworthy provenance, and the signature
would guarantee nothing.

### Consequence panel

Recomputes on every keystroke from `kmTotals`, `timeTotals` and `computeAllowances`.

- Reports **distance and duration. Never money.** Allowance quantities need the
  whole rate card loaded; the row states they are recalculated on save instead.
  What the operator verifies aloud is the distance, so that is what is live.
- Unknown renders as an em-dash or "not recorded" — never `0`. Zero kilometres is a
  claim the data does not support, matching the rule the duty slip already follows.
- An invalid input renders an em-dash rather than a computed-but-wrong figure.

Its purpose is a spoken sanity check — *"142 kilometres, does that sound right?"* —
while the driver is still on the line.

### "Not known" checkbox

Per FR-59, closing with no readings is permitted; per FR-65 such a duty invoices at
base rate. An empty input cannot distinguish *not yet typed* from *genuinely
unavailable*; a ticked box records the second as a fact.

Ticking greys and empties the input **in place** — the row does not collapse, because
drivers reverse themselves mid-call ("hang on, I wrote it on the slip").

## State Patterns

The driver app writes five fields at three moments, so any partial combination is
reachable.

| State | Present | Modal asks for |
|---|---|---|
| **S0 Blank** | nothing | everything — the common case |
| **S1 Started** | `started_at`, `start_odo`, photo | close half only; start block locks |
| **S2 On board** | S1 + `picked_up_at` | identical to S1 |
| **S3 Closed** | all five + signature | *action absent* |
| **S4 No-show** | `no_show_reason`, `closed_at` | *action absent* |
| **S5 Back-dated** | nothing, dates already past | as S0 |
| **S6 No driver** | vehicle only, `driver_id` null | as S0, no one to call |
| **S7 Expenses only** | expense rows, no odometer | as S0, existing expenses shown |

### Refusals

- **S3 / S4 — the action does not appear.** Both are closed. Offering it invites
  overwriting a signed record with a remembered one.
- **`Billed` / `Cancelled`** — absent. A billed duty's figures are on an invoice
  already sent.
- **End reading not above start** — blocks save, named inline against the start
  figure that is already on screen. Mirrors `duties_odo_forward` so Postgres never has
  to be the one to refuse.
- **`closed_at` before `started_at`** — blocks save.
- **Dates in the past** — permitted silently. Back-dated entry is S5, a named use
  case, not a mistake.

### The live-duty notice

FR-59's time gate was deliberately dropped (see `.decision-log.md` D3). Where the
duty's driver *has* a login and now falls inside the duty window, the modal carries an
inline notice naming them — *"Ramesh can still close this himself from the app."* The
close remains permitted. This is a mitigation, not a block.

### Concurrency

The driver closes while the modal is open. Server-side `coalesce` in
`driver_close_duty` means the driver's values win, which is correct — they had the
odometer in front of them. The modal reloads and reports what was submitted rather
than surfacing a save failure.

## Interaction Primitives

- **Defaults are labelled.** Timestamps default to the planned window
  (`start_date + reporting_time`, `end_date + est_drop_time`) and carry a visible
  *from the booking* hint. **Never `now()`** — a production duty due to drop 25 Jul
  was closed 17 Aug, computing ~550 hours of overtime. Defaulting to the planned
  window resolves overtime to exactly zero; it becomes billable only when an operator
  types a later time deliberately.
- **The driver's phone number is a `tel:` chip in the context card.** This screen
  exists because a call is happening. Making the operator leave to find a number is
  the likeliest cause of a half-filled close — which is worse than none, because it
  looks finished.
- **Save writes** the four slip fields, `status: 'Completed'` (unless `Billed`/
  `Cancelled`), `closed_by_profile: auth.uid()`, `corrected_at: now()`. Then
  `syncBookingStatus(bookingId)` and `syncDutyAllowances(dutyId)` — the second is
  easy to forget and every overtime quantity stays at zero without it.
- **No new RPC, no migration.** Operator RLS on `duties` is a single `ALL` policy
  scoped through the booking; all three audit columns have existed unused since
  migration 025.

## Accessibility Floor

- Focus order follows the narration order: context → start → close → expenses →
  save. The locked block is skipped entirely; its Correct links remain reachable.
- The backwards-reading error is `aria-live="polite"` and referenced by
  `aria-describedby` on its input — it changes while the operator types.
- "Not known" is a real `<input type="checkbox">` with a label, not a styled div.
  Ticking it sets `disabled` on the paired input, which removes it from focus order
  naturally.
- Evidence chips carry the reading they belong to in their accessible name —
  "Photo of start odometer, 45,120 km" — since "Photo" alone is meaningless out of
  context.
- Every state is carried by text, never colour alone: the base-rate close states its
  consequence in words, and the invalid field names the number it must exceed.

## Key Flows

### Flow 1 — Priya closes the evening's duties (Priya, operator, 8:40pm, eleven duties back)

1. Priya opens **All Duties** and picks the **Needs closing** filter. Nine rows.
2. Row one: Sharma Textiles, Ramesh Kumar, nothing captured — Ramesh has no app.
3. She opens Close Duty and taps the phone chip. Ramesh picks up.
4. *"What did the meter say when you left?"* — 45,120. *"And at the drop?"* — 45,262.
5. **Climax.** The consequence panel updates as she types: **142 km, package 120,
   +22 extra.** She reads it back — *"142 kilometres, that sounds right?"* — and
   Ramesh confirms. The extra-kilometre charge is now defensible because a human
   verified it out loud before it was saved, which is the one check no constraint
   can perform.
6. Times are already right — he left and dropped roughly on schedule — so she leaves
   the defaults and saves. Eight to go.

### Flow 2 — Priya finds a duty that vanished (Priya, 9:05pm, same session)

1. Further down the list: Meridian Corp, 21 August, two days ago, still open.
2. The modal shows Suresh's locked start block — 07:04, 45,120 km, with a photo.
   He started properly and then stopped.
3. She calls. He remembers dropping around seven but not the closing reading.
4. She types 45,090 from memory of a similar run. The field turns amber:
   **must be more than the start reading of 45,120 km.** Save is disabled.
5. **Climax.** The error stops her inventing a number. She asks Suresh to check the
   paper slip in the glovebox; he finds 45,290. The guard converted a plausible
   fabrication into a real reading — and had it not been there, an invented figure
   would have invoiced as fact.

### Flow 3 — Priya enters last month's paper slips (Priya, month-end, a stack of forms)

1. Twelve duties from July, entered as back-dated bookings and allotted after the
   fact. Every one reads **Completed** with an empty slip.
2. Without the Needs closing filter she would have no way to tell them from genuinely
   finished duties — this is why FR-58 ships with FR-59 rather than after it.
3. For each: dates from the slip, both readings from the slip, no phone call needed.
4. **Climax.** Slip nine has a torn corner; the closing reading is gone. She ticks
   **Not known** on the end odometer and the panel switches to *not recorded — no
   extra-km charge*, with an amber note that the duty will invoice at base rate.
   She saves it that way. The alternative — guessing, or leaving it open forever —
   would either invent revenue or lose it silently. Recording the gap honestly is the
   only option that stays true, and FR-65 already specified what it costs.
