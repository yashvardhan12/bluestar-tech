alter table public.fuel_logs
  alter column rate drop not null,
  add column if not exists paid_by     text not null default 'Company' check (paid_by in ('Company', 'Driver')),
  add column if not exists receipt_url text,
  add column if not exists notes       text;
