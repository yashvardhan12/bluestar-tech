-- ── Bookings ──────────────────────────────────────────────────────────────────

create sequence if not exists public.booking_ref_seq start 1;

create table if not exists public.bookings (
  id                        bigint generated always as identity primary key,
  booking_ref               text unique not null default '',
  status                    text not null default 'Booked'
                              check (status in ('Booked', 'Confirmed', 'On-Going', 'Completed', 'Billed', 'Cancelled')),
  customer_name             text not null,
  booked_by_name            text,
  booked_by_phone           text,
  booked_by_email           text,
  duty_type                 text,
  vehicle_group_id          bigint references public.vehicle_groups(id) on delete set null,
  assign_alternate_vehicles boolean not null default false,
  booking_type              text not null default 'local'
                              check (booking_type in ('local', 'outstation')),
  is_airport_booking        boolean not null default false,
  from_location             text,
  to_location               text,
  reporting_address         text,
  drop_address              text,
  start_date                date not null,
  end_date                  date not null,
  reporting_time            time,
  est_drop_time             time,
  garage_start_mins         integer,
  base_rate                 numeric(12, 2),
  extra_km_rate             numeric(12, 2),
  extra_hour_rate           numeric(12, 2),
  bill_to                   text default 'company',
  operator_notes            text,
  driver_notes              text,
  send_confirmation         boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ── Booking passengers (multiple per booking) ─────────────────────────────────

create table if not exists public.booking_passengers (
  id         bigint generated always as identity primary key,
  booking_id bigint not null references public.bookings(id) on delete cascade,
  name       text,
  phone      text,
  sort_order integer not null default 0
);

-- ── Auto-generate booking ref (BK-00001, BK-00002, …) ────────────────────────

create or replace function public.set_booking_ref()
returns trigger language plpgsql as $$
begin
  if new.booking_ref = '' then
    new.booking_ref := 'BK-' || lpad(nextval('public.booking_ref_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

create or replace trigger bookings_set_ref
  before insert on public.bookings
  for each row execute procedure public.set_booking_ref();

-- ── Auto-update updated_at ────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger bookings_updated_at
  before update on public.bookings
  for each row execute procedure public.set_updated_at();

-- ── RLS (open for now) ────────────────────────────────────────────────────────

alter table public.bookings           enable row level security;
alter table public.booking_passengers enable row level security;

create policy "Allow all" on public.bookings
  for all using (true) with check (true);

create policy "Allow all" on public.booking_passengers
  for all using (true) with check (true);
