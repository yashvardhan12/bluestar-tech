-- 038 — a third baseline: a time the operator sets themselves.
--
-- 028 gave overtime and early start two clocks to measure against: the duty's
-- own scheduled times, or the driver's shift. Neither covers a company whose
-- overtime starts at a fixed hour regardless of what the duty was booked for.
--
-- 'custom' reads baseline_time instead. Left blank it falls back to the duty
-- window, the same way 'driver_shift' already falls back when a driver has no
-- shift recorded — an allowance that silently pays nothing is the worse bug.

alter table public.allowances
  drop constraint allowances_baseline_check;

alter table public.allowances
  add constraint allowances_baseline_check
  check (baseline in ('duty_window', 'driver_shift', 'custom'));

alter table public.allowances
  add column baseline_time time;

comment on column public.allowances.baseline_time is
  'Clock time overtime/early start measure against when baseline = ''custom''. Null falls back to the duty window.';
