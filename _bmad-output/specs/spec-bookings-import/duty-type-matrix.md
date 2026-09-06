# Duty type resolution and the rate card

## The key differs by package

Established by ambiguity testing — same key, two different rates — over 261
bookings:

| Package | keyed by Car only | keyed by Zone + Car |
|---|---|---|
| Airport Pick Up | 3 of 4 ambiguous | **0 ambiguous** |
| Intra City | 0 ambiguous (with hours) | 0 — zone adds nothing |
| Outstation | **0 ambiguous** | — |

So zone is load-bearing for Airport only.

## Naming convention

Confirmed against the live `duty_types` table:

| Package Type | `duty_types.type_name` | `category` |
|---|---|---|
| Intra City | `Hourly \| {Car}` | Hourly |
| Airport Pick Up | `Airport Zone {N} \| {Car}` | Airport |
| Monthly | `Monthly \| {Car}` | Monthly |
| Outstation | `Outdoor \| {Car}` | Outstation |

Matching must normalise: the live table contains both `Airport Zone - 1 | Sedan`
and `Airport Zone 2 | Sedan`. Lowercase and strip all characters except
`a-z0-9|` so both collapse to one key.

## The 23 types

| Package | Category | Count |
|---|---|---|
| Intra City | Hourly | 7 (by car) |
| Airport Pick Up | Airport | 11 (zone × car) |
| Monthly | Monthly | 2 |
| Outstation | Outstation | 3 |

Four exist (`Hourly | Sedan`, `Airport Zone 1/2/3 | Sedan`), leaving nineteen —
twenty-one counting the two `Superium Deluxe` combinations.

`Superium Deluxe` appears in the sheet but in no vehicle group; the live table
holds both `Super Deluxe` and `Supreme Deluxe`, so it could be a mangling of
either. **The import does not choose.** It reports the car type as unresolved,
exactly like any other missing reference, and the operator either corrects the
sheet or adds the vehicle group. This is the same rule as everywhere else: the
import never invents reference data, and a wrong fold here misprices 8 bookings.

## Rates are derivable from the sheet

These rates seed the `duty_types` rate card. They are **not** written onto
imported duties — the import carries no money, and the system derives amounts
when duties complete. The card still has to be right, because that derivation
reads from it.

The Intra City curve is a flat base to 4h then per-hour slabs whose boundaries
match the `duty_types` columns exactly — `fixed_charges`, `rate_0_6_hrs`,
`rate_6_12_hrs`, `rate_12_plus_hrs`:

```
Premium Suv  base ₹1,864 (≤4h) → ₹466/hr to 6h → ₹386/hr to 12h → ₹306/hr beyond
Sedan        base ₹1,104 (≤4h) → …             → ₹231/hr in the 6–12 band
```

51 (car × hour) combinations, zero contradictions across 168 bookings. Airport
is flat per (zone, car): Zone 1 Sedan ₹477, Zone 2 ₹689, Zone 3 ₹901.

Monthly cannot be derived — 5 bookings, and its one car type is ambiguous.
Those rates must be entered by hand.

## Source columns feeding the card

`Fixed value charge` · `Extra Hrs charge` · `Extra km charge` ·
`Night Allowance` · `MUMBAI Local Fr8` · `Outstation Per Km` ·
`Monthly basic Fr8` · `Monthly Extra HR` · `Monthly Per KM` · `Weekly off` ·
`Airport Basic Fr8` · `Outstation fix fr8`
