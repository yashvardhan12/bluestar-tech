# Field mapping — client trip export → Blue Star schema

Sheet `Trip`, 59 columns. Verified against `~/Downloads/Bulk Upload Sample.xlsx`
(1,073 rows). All cells are text; dates are `dd-mm-yyyy`, amounts are strings.

| Bucket | Count |
|---|---|
| 100% empty — ignore | 13 |
| Carry data | 46 |
| → map to schema | 19 |
| → rate card, for seeding `duty_types` | 12 |
| → no home in schema | 15 |

## Booking level — from the first row of each `Travel ID` group

| Col | Sheet | Target | Note |
|---|---|---|---|
| B | Travel ID | `bookings.booking_ref` | the grouping key and the idempotency key |
| D | Trip Start Date | `bookings.start_date` | parse `dd-mm-yyyy` |
| E | Trip End Date | `bookings.end_date` | |
| AB | Company name | `bookings.customer_name` | display only — **not** the match key |
| AC | Company GSTIN | — (match key) | matched against the GSTIN inside `customers.name` |
| S | Source | `bookings.from_location` | must exist in `locations` |
| T | Destination | `bookings.to_location` | |
| U | Car Type | → `duty_type`, `vehicle_group` | derived |
| V | Package Type | → `duty_type`, `booking_type`, `is_airport_booking` | derived |
| Y | Zone No | → `duty_type` (Airport only) | derived |
| Z | Employee name | `booking_passengers.name` | no phone exists in the file |

## Duty level — one sheet row = one duty

| Col | Sheet | Target | Note |
|---|---|---|---|
| H | Daily Journey Start Date | `duties.start_date` | via `resolveDutyTimes` |
| J | Daily Journey End Date | `duties.end_date` | may be rolled +1 |
| I | Daily Journey Start Time | `duties.reporting_time` | may be swapped with K |
| K | Daily Journey End Time | `duties.est_drop_time` | |

## Validation-only, not stored

`Q` Daily Journey Time (selects the rate slab and referees the time repair) ·
`R` Vendor · `W` Daily Journey Package Type (duplicate of V) · `X` Zone Type ·
`AS` One Way Trip (informs `duty_types.is_p2p`) · `D`/`E` also bound each duty
via `tripWindowViolation`.

`AR` Month is **not** a date validator — it is the settlement month and lags
travel by 0, 1 or 3 months. Using it flagged 192 correct rows.

## No home in the schema

`Trip ID` · `Vendor GSTIN` · `Trip Distance` · `SAC` · `Daily Journey Distance` ·
`Daily Journey Vehicle Number` · `Interstate` · **`Toll Tax`** ·
**`Parking Charge`** · `Employee code` · `Company GSTIN` (as a stored value) ·
**`Revenue amount`** · **`Total amount`** · `Cost Centre`

`Daily Journey Vehicle Number` holds placeholders, so `duties.vehicle_id` stays
null and the operator allots afterwards. `Daily Journey Distance` is present on
28 rows and is a distance, not the absolute `start_odo`/`end_odo` pair the
schema stores — those 28 correlate exactly with `SAC` and `Vendor GSTIN`, so
they mark billing depth, not completion.

The four in bold are money and none of them are imported. The system derives
the amount when duties complete, so the client's settled figures are read past.
Worth knowing if that ever changes: `Total amount` is per **trip**, repeated on
every row — 0 of 113 multi-day trips vary it — so mapping it onto a per-duty
column multiplies a booking by its duty count.

## Empty in every row

`Daily Journey Vendor/Auditor/Admin remark(latest)` ·
`Vendor/Auditor/Admin remark (latest)` · `Changed Vendor GSTIN` ·
`Changed Start date` · `Changed End date` · `Changed days` ·
`Changed Revenue amount` · `Changed Total amount` · `Changed SAC`
