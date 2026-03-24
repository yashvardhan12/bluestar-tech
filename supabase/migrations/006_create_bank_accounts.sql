create table if not exists public.bank_accounts (
  id             bigint generated always as identity primary key,
  account_name   text not null,
  account_number text not null,
  ifsc_code      text not null,
  bank_name      text not null,
  bank_branch    text not null,
  notes          text,
  created_at     timestamptz not null default now()
);

alter table public.bank_accounts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'bank_accounts' and policyname = 'Allow all'
  ) then
    execute 'create policy "Allow all" on public.bank_accounts for all using (true) with check (true)';
  end if;
end $$;
