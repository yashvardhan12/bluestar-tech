create table if not exists public.duties (
  id                bigint generated always as identity primary key,
  booking_id        bigint not null references public.bookings(id) on delete cascade,
  status            text not null default 'Booked'
                      check (status in ('Booked', 'Allotted', 'On-Going', 'Completed', 'Billed', 'Cancelled')),
  start_date        date not null,
  end_date          date not null,
  reporting_time    time,
  est_drop_time     time,
  garage_start_mins integer,
  duty_type         text,
  vehicle_group     text,
  from_location     text,
  to_location       text,
  reporting_address text,
  drop_address      text,
  vehicle_id        bigint references public.vehicles(id) on delete set null,
  driver_id         bigint references public.drivers(id) on delete set null,
  base_rate         numeric(12,2),
  extra_km_rate     numeric(12,2),
  extra_hour_rate   numeric(12,2),
  bill_to           text,
  operator_notes    text,
  driver_notes      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create or replace trigger duties_updated_at
  before update on public.duties
  for each row execute procedure public.set_updated_at();

alter table public.duties enable row level security;

create policy "Allow all" on public.duties
  for all using (true) with check (true);
