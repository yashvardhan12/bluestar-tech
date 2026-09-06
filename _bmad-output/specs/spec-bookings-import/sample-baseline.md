# Sample baseline — regression numbers

Measured against `~/Downloads/Bulk Upload Sample.xlsx` (sheet `Trip`, 59 columns,
1,073 rows) with the live reference data as of 2026-08-29. Any change to these
without a deliberate cause is a regression.

## Shape

| | |
|---|---|
| rows | 1,073 |
| bookings (distinct `Travel ID`) | 261 |
| distinct `Trip ID` | 251 — **8 of them hold two bookings** |
| all duties predated | 1,073 / 1,073 |

## Duty window resolution

| `fix` | count |
|---|---|
| `none` | 972 |
| `swapped` | 99 |
| `rolled` | 0 |
| `ambiguous` | 2 |

The 2 ambiguous rows are 12-hour Intra City duties (`22:00 → 10:00`, stated 12h)
where a swap and a rollover are arithmetically indistinguishable.

Evidence the referee is sound: 400 of 400 sampled coherent rows agree with the
client's `Daily Journey Time` to within an hour; of the 101 rows where
`end <= start` on the same date, 99 match the swapped reading, **0** match the
rolled reading, 2 tie.

## Reference resolution

| | |
|---|---|
| customers matched (GSTIN in name) | 122 / 261 bookings · 574 / 1,073 duties |
| customer GSTINs missing | 17, covering 499 duty rows |
| duty types missing | 21 — includes 2 `Superium Deluxe` combinations, reported unresolved by design |
| locations missing | **0** — closed by migration 031 |
| trip-window violations | 0 |
| fully ready bookings | 29 |

All 1,073 duties land unallotted (`vehicle_id` null, `driver_id` null) and read
`Booked` through `duties_status`.

`Reliance Industries Ltd` alone spans 7 GSTINs; 19 GSTINs across 9 company names.

## Reproducing

```
node --experimental-strip-types src/lib/importDutyTimes.check.ts
open _bmad-output/booking-import-preflight.html   # drop the sheet in
```
