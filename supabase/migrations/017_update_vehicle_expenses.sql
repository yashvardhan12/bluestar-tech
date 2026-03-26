alter table public.vehicle_expenses
  add column if not exists paid_by     text not null default 'Company' check (paid_by in ('Company', 'Driver')),
  add column if not exists driver_name text,
  alter column payment_mode drop not null;
