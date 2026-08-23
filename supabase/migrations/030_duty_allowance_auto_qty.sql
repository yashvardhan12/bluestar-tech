-- 030_duty_allowance_auto_qty.sql
-- What the calculation said before anyone edited it.
--
-- Without this an overridden row can only say "Edited", which tells a reader
-- that something changed but not what, or whether it was reasonable. Holding
-- the computed quantity lets the slip print "was 2 hours" and offer a reset
-- back to it. Null on rows nobody has touched.

alter table public.duty_allowances add column auto_qty numeric;

comment on column public.duty_allowances.auto_qty is
  'Quantity the calculation produced, kept only on manually overridden rows so the slip can show what it was and offer a reset.';
