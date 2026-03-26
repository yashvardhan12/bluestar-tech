-- Driver Payroll
create table if not exists public.driver_payroll (
  id               bigint generated always as identity primary key,
  driver_id        bigint not null references public.drivers(id) on delete cascade,
  month            text not null,             -- format: YYYY-MM
  base_salary      numeric(12,2) not null default 0,
  allowances       numeric(12,2),
  fuel             numeric(12,2),
  car_wash         numeric(12,2),
  fast_tags        numeric(12,2),
  parking          numeric(12,2),
  challans         numeric(12,2),
  advance_balance  numeric(12,2),
  status           text not null default 'Not Paid'
                     check (status in ('Paid', 'Not Paid', 'Partially Paid')),
  created_at       timestamptz not null default now(),
  unique (driver_id, month)
);

alter table public.driver_payroll enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'driver_payroll' and policyname = 'Allow all'
  ) then
    execute 'create policy "Allow all" on public.driver_payroll for all using (true) with check (true)';
  end if;
end $$;
