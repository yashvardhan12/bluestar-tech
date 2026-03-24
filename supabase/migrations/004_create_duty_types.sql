create table if not exists public.duty_types (
  id                        bigint generated always as identity primary key,
  category                  text not null check (category in ('Airport','Hourly','Outstation','Monthly')),
  type_name                 text not null,
  vehicle_group_id          bigint references public.vehicle_groups(id) on delete set null,
  -- Airport + Monthly
  fixed_charges             numeric(12,2),
  -- Airport only
  night_charges             numeric(12,2),
  -- Hourly only
  threshold_km              numeric(12,2),
  rate_0_6_hrs              numeric(12,2),
  rate_6_12_hrs             numeric(12,2),
  rate_12_plus_hrs          numeric(12,2),
  -- Hourly + Outstation + Monthly
  rate_per_km               numeric(12,2),
  -- Outstation + Monthly
  daily_outstation_charges  numeric(12,2),
  -- All categories
  is_p2p                    boolean not null default false,
  is_gtg                    boolean not null default false,
  created_at                timestamptz not null default now()
);

alter table public.duty_types enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'duty_types' and policyname = 'Allow all'
  ) then
    execute 'create policy "Allow all" on public.duty_types for all using (true) with check (true)';
  end if;
end $$;
