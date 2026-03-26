-- Driver Expense Logs (daily entries)
create table if not exists public.driver_expense_logs (
  id         bigint generated always as identity primary key,
  driver_id  bigint not null references public.drivers(id) on delete cascade,
  date       date not null,
  type       text not null,           -- e.g. 'Allowances', 'Fuel', 'Car Wash', 'Fast Tags', 'Parking', 'Challans', 'Other'
  amount     numeric(12,2) not null,
  created_at timestamptz not null default now()
);

alter table public.driver_expense_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'driver_expense_logs' and policyname = 'Allow all'
  ) then
    execute 'create policy "Allow all" on public.driver_expense_logs for all using (true) with check (true)';
  end if;
end $$;
