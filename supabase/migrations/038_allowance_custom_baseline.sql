-- 038 — a third baseline: a time the operator sets themselves.
--
-- 028 gave overtime and early start two clocks to measure against: the duty's
-- own scheduled times, or the driver's shift. Neither covers a company whose
-- overtime starts at a fixed hour regardless of what the duty was booked for.
--
-- 'custom' reads baseline_time instead. Left blank it falls back to the duty
-- window, the same way 'driver_shift' already falls back when a driver has no
-- shift recorded — an allowance that silently pays nothing is the worse bug.

-- Dropped by discovery rather than by name, the same way 037 does it:
-- supabase/migrations/ drifts from production, so the constraint may not be
-- called what 028 would have named it. Dropping by name with `if exists` is the
-- wrong fix — it would skip silently and leave the old constraint still
-- rejecting 'custom'.
do $$
declare c text;
begin
  select con.conname into c
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where rel.relname = 'allowances'
    and ns.nspname  = 'public'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%baseline%';

  if c is not null then
    execute format('alter table public.allowances drop constraint %I', c);
  end if;
end $$;

alter table public.allowances
  add constraint allowances_baseline_check
  check (baseline in ('duty_window', 'driver_shift', 'custom'));

alter table public.allowances
  add column if not exists baseline_time time;

comment on column public.allowances.baseline_time is
  'Clock time overtime/early start measure against when baseline = ''custom''. Null falls back to the duty window.';
