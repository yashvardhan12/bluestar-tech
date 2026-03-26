create table if not exists public.fuel_logs (
  id             bigint generated always as identity primary key,
  vehicle_name   text not null,
  vehicle_number text not null,
  date           date not null,
  driver_name    text,
  fuel_type      text not null check (fuel_type in ('Petrol', 'Diesel')),
  quantity       numeric(8,2) not null,
  rate           numeric(8,2) not null,
  amount         numeric(12,2) not null,
  status         text not null default 'Pending' check (status in ('Pending', 'Approved')),
  created_at     timestamptz not null default now()
);

alter table public.fuel_logs enable row level security;

create policy "Allow all" on public.fuel_logs
  for all using (true) with check (true);
