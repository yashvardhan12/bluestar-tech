create table if not exists public.taxes (
  id          bigint generated always as identity primary key,
  tax_name    text not null,
  percentage  numeric(6,2) not null,
  status      text not null default 'Active' check (status in ('Active', 'Inactive')),
  notes       text,
  created_at  timestamptz not null default now()
);

alter table public.taxes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'taxes' and policyname = 'Allow all'
  ) then
    execute 'create policy "Allow all" on public.taxes for all using (true) with check (true)';
  end if;
end $$;
