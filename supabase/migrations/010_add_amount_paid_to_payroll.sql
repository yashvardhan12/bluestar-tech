alter table public.driver_payroll
  add column if not exists amount_paid numeric(12,2) not null default 0;
