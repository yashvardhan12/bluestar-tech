-- 028_allowances.sql
-- Nine duty allowances. The quantity is computed once per duty per allowance,
-- then priced twice: the driver rate is company-wide, the customer rate is set
-- per duty type and exists only where the operator chose to bill for it.

-- ── duty type names must be unique before a rate card can hang off them ──────
-- duties.duty_type is free text, resolved by name at read time (DutySlipDrawer
-- does .eq('type_name', …).maybeSingle(), which silently returns null when two
-- types share a name). Verified zero duplicates in production before adding.
create unique index duty_types_company_type_name_key
  on public.duty_types (company_id, type_name);

-- ── master list ──────────────────────────────────────────────────────────────
create table public.allowances (
  id          bigint      generated always as identity primary key,
  company_id  bigint      not null default current_company_id() references public.companies(id),
  code        text        not null,
  name        text        not null,
  unit        text        not null check (unit in ('day', 'hour', 'duty', 'night')),
  -- Only overtime and early_start read this. 'driver_shift' falls back to the
  -- duty window for any driver with no shift times set — otherwise the
  -- allowance silently pays nothing, which is worse than being approximate.
  baseline    text        not null default 'duty_window'
                          check (baseline in ('duty_window', 'driver_shift')),
  driver_rate numeric,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  unique (company_id, code)
);

alter table public.allowances enable row level security;

create policy "company scoped" on public.allowances
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());

create trigger guard_company_id before update on public.allowances
  for each row execute function guard_company_id_immutable();

-- ── which allowances a duty type bills for, and at what price ────────────────
-- No company_id: scoped through duty_types, which is itself company scoped.
create table public.duty_type_allowances (
  duty_type_id  bigint  not null references public.duty_types(id) on delete cascade,
  allowance_id  bigint  not null references public.allowances(id) on delete cascade,
  customer_rate numeric not null,
  primary key (duty_type_id, allowance_id)
);

create index duty_type_allowances_allowance_idx
  on public.duty_type_allowances (allowance_id);

alter table public.duty_type_allowances enable row level security;

create policy "scoped via duty type" on public.duty_type_allowances
  for all using (duty_type_id in (select id from public.duty_types))
  with check (duty_type_id in (select id from public.duty_types));

-- ── the snapshot ─────────────────────────────────────────────────────────────
-- Rates are copied in at compute time and never joined at read time: editing
-- the rate card must not rewrite an invoice that has already gone out. This is
-- also what makes the free-text duty_type survivable — the name is resolved
-- once, here, and never consulted again.
-- No company_id: scoped through duties, itself scoped through bookings.
create table public.duty_allowances (
  id              bigint      generated always as identity primary key,
  duty_id         bigint      not null references public.duties(id) on delete cascade,
  allowance_id    bigint      not null references public.allowances(id),
  qty             numeric     not null,
  customer_rate   numeric,
  customer_amount numeric     not null default 0,
  driver_rate     numeric,
  driver_amount   numeric     not null default 0,
  -- 'manual' rows are never overwritten by a recompute.
  source          text        not null default 'auto'
                              check (source in ('auto', 'manual')),
  created_at      timestamptz not null default now(),
  unique (duty_id, allowance_id)
);

create index duty_allowances_allowance_idx on public.duty_allowances (allowance_id);

alter table public.duty_allowances enable row level security;

create policy "scoped via duty" on public.duty_allowances
  for all using (duty_id in (select id from public.duties))
  with check (duty_id in (select id from public.duties));

-- ── seeding ──────────────────────────────────────────────────────────────────
-- security definer because the company-creation path runs before the creator's
-- active_company_id points at the new company, so the RLS policy above would
-- reject the insert.
create function public.seed_company_allowances(target bigint)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.allowances (company_id, code, name, unit)
  values
    (target, 'daily',                'Daily allowance',                'day'),
    (target, 'overtime',             'Overtime allowance',             'hour'),
    (target, 'outstation',           'Outstation allowance',           'day'),
    (target, 'outstation_overnight', 'Outstation overnight allowance', 'night'),
    (target, 'off_day',              'Off-day allowance',              'duty'),
    (target, 'early_start',          'Early start allowance',          'hour'),
    (target, 'night',                'Night allowance',                'night'),
    (target, 'extra_duty',           'Extra duty allowance',           'duty'),
    (target, 'airport',              'Airport allowance',              'duty')
  on conflict (company_id, code) do nothing;
$$;

create function public.seed_allowances_on_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_company_allowances(new.id);
  return new;
end;
$$;

-- Without this a new company has no allowances at all and the whole feature
-- silently does nothing for them.
create trigger seed_allowances after insert on public.companies
  for each row execute function public.seed_allowances_on_company();

select public.seed_company_allowances(id) from public.companies;
