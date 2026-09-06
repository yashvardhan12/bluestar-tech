-- Distance without an odometer pair.
--
-- start_odo/end_odo only ever existed to produce a distance. An operator
-- closing a duty from a paper slip often has the distance and no readings, so
-- let them write it directly. Nullable, and the readings still win when both
-- are present (see kmTotals in src/lib/dutySlip.ts).

alter table public.duties
  add column if not exists total_km numeric;

alter table public.duties
  drop constraint if exists duties_total_km_positive;

alter table public.duties
  add constraint duties_total_km_positive
  check (total_km is null or total_km > 0);

comment on column public.duties.total_km is
  'Distance run in km, entered directly when no odometer pair was captured.';
