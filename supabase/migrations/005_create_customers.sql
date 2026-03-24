create table if not exists public.customers (
  id                    bigint generated always as identity primary key,
  customer_code         text not null unique,
  name                  text not null,
  address               text,
  pincode               text,
  state                 text,
  phone                 text,
  email                 text,
  -- Tax details
  tax_type              text check (tax_type in ('Business', 'Individual')),
  gstin_number          text,
  billing_name          text,
  billing_address       text,
  taxes                 text,
  -- Other
  default_discount      numeric(5,2),
  attach_document_url   text,
  notes                 text,
  auto_create_invoice   boolean not null default false,
  created_at            timestamptz not null default now()
);

alter table public.customers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'customers' and policyname = 'Allow all'
  ) then
    execute 'create policy "Allow all" on public.customers for all using (true) with check (true)';
  end if;
end $$;
