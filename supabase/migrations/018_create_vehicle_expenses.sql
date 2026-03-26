create table if not exists public.vehicle_expenses (
  id              bigint generated always as identity primary key,
  vehicle_name    text not null,
  vehicle_number  text not null,
  expense_number  text not null,
  date            date not null,
  payment_mode    text check (payment_mode in ('Cash', 'Card', 'UPI', 'Cheque', 'Bank Transfer')),
  paid_by         text not null default 'Company' check (paid_by in ('Company', 'Driver')),
  driver_name     text,
  amount          numeric(12,2) not null,
  description     text,
  created_at      timestamptz not null default now()
);

alter table public.vehicle_expenses enable row level security;
create policy "Allow all" on public.vehicle_expenses for all using (true) with check (true);
