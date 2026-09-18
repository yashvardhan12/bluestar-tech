-- Custom duty type: the "first n hours or n km, whichever occurs first" package.
--
-- The fifth category. Its relation is priced by customLines() in
-- src/lib/dutyPrice.ts and asserted in dutyPrice.check.ts — a package rate, then
-- a per-hour rate past included_hours and a per-km rate past included_km. Both
-- overages bill; "whichever occurs first" ends the package, it does not choose
-- which overage applies.
--
-- Nothing is seeded. Every limit and every rate is operator-entered, so a 4/40
-- contract and an 8/80 one are the same category with different numbers.

alter table duty_types
  -- Null on either of these means that axis is not metered: a package with no
  -- cap, not a free overage. customLines() skips the overage entirely.
  -- numeric, matching threshold_km on this same table: a half-day package is
  -- 4.5 hours, and an int column would round that to 4 without saying so.
  add column if not exists included_hours numeric(12,2),
  add column if not exists included_km    numeric(12,2),
  -- Deliberately not fixed_charges. That column belongs to Airport, and
  -- dutyPrice.ts's one-category-one-relation rule means no category may read
  -- another's field — including through shared storage.
  add column if not exists package_rate   numeric(12,2),
  -- Named to match bookings.extra_km_rate and duties.extra_km_rate, which both
  -- already exist and are typed by hand today. extra_hour_rate arrived in 033.
  add column if not exists extra_km_rate  numeric(12,2);

-- The category CHECK gains a fifth value. Dropped by discovery rather than by
-- name: supabase/migrations/ drifts from production, so the constraint may not
-- be called what 004 would have named it.
do $$
declare c text;
begin
  select con.conname into c
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where rel.relname = 'duty_types'
    and ns.nspname  = 'public'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%category%';

  if c is not null then
    execute format('alter table public.duty_types drop constraint %I', c);
  end if;
end $$;

alter table duty_types
  add constraint duty_types_category_check
  check (category in ('Airport', 'Hourly', 'Outstation', 'Monthly', 'Custom'));
