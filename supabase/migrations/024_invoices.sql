-- ═══════════════════════════════════════════════════════════════════════════
-- 024 — Invoices
--
-- Greenfield: nothing billing-related existed in the database. Three tables,
-- scoped with the flavours established in 020:
--
--   A. invoices          — own company_id, default current_company_id()
--   B. invoice_bookings  — derived from invoices
--   B. invoice_lines     — derived from invoices
--
-- Plus invoice_counters, which is what makes invoice numbers collision-safe.
-- The customer-code scheme at CustomersPage.tsx:349 reads the max and adds
-- one from the browser; two people clicking Save together get the same code.
-- Numbers here are assigned by a trigger inside the insert's transaction.
--
-- Receipts and payments are deliberately out of scope. amount_paid exists so
-- the list's Amount paid / Outstanding columns have something to read, and
-- stays 0 until payments ship.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── invoices ───────────────────────────────────────────────────────────────

create table if not exists public.invoices (
  id                 bigint generated always as identity primary key,

  invoice_number     text not null default '',
  status             text not null default 'Generated'
                       check (status in ('Generated', 'Paid', 'Cancelled')),

  -- Customer is snapshotted, not just referenced. Editing a customer record
  -- must not retroactively rewrite an invoice that was already sent.
  -- customer_id is nullable and ON DELETE SET NULL for the same reason: the
  -- invoice survives the customer.
  customer_id        bigint references public.customers(id) on delete set null,
  customer_name      text not null,
  gstin_number       text,
  billing_name       text,
  billing_address    text,

  invoice_date       date not null default current_date,
  due_date           date,
  period_start       date,
  period_end         date,
  tax_classification text,
  notes              text,

  subtotal           numeric(14,2) not null default 0,
  discount_total     numeric(14,2) not null default 0,
  tax_total          numeric(14,2) not null default 0,
  total              numeric(14,2) not null default 0,
  amount_paid        numeric(14,2) not null default 0,
  outstanding        numeric(14,2) generated always as (total - amount_paid) stored,

  -- [{ name, url, size }] — one jsonb column instead of a fourth table.
  -- FileUpload already hands back a URL string; nothing queries into these.
  attachments        jsonb not null default '[]'::jsonb,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  company_id         bigint not null default public.current_company_id()
                       references public.companies(id)
);

-- Unique per company, not globally: two tenants may both run GR2425-0001.
create unique index if not exists invoices_number_company_idx
  on public.invoices (company_id, invoice_number);
create index if not exists invoices_company_idx  on public.invoices (company_id);
create index if not exists invoices_customer_idx on public.invoices (customer_id);

-- ── invoice_bookings ───────────────────────────────────────────────────────
-- Which bookings this invoice covers. Many-to-one; the list's "+2" chip is a
-- count of these rows.

create table if not exists public.invoice_bookings (
  id                 bigint generated always as identity primary key,
  invoice_id         bigint not null references public.invoices(id) on delete cascade,
  booking_id         bigint not null references public.bookings(id),
  custom_description text,
  amount             numeric(14,2) not null default 0,
  sort_order         int not null default 0,
  unique (invoice_id, booking_id)
);

create index if not exists invoice_bookings_invoice_idx on public.invoice_bookings (invoice_id);
create index if not exists invoice_bookings_booking_idx on public.invoice_bookings (booking_id);

-- ── invoice_lines ──────────────────────────────────────────────────────────
-- Taxes, discounts and custom rows in one table with a discriminator. Three
-- tables with identical shapes would buy nothing.
--
--   kind='tax'      label='CGST 12%'   rate=12    amount=<computed>
--   kind='discount' label='By amount'  rate=null  amount=4000
--   kind='custom'   label='Taxable'    rate=null  amount=4000

create table if not exists public.invoice_lines (
  id          bigint generated always as identity primary key,
  invoice_id  bigint not null references public.invoices(id) on delete cascade,
  kind        text not null check (kind in ('tax', 'discount', 'custom')),
  label       text,
  rate        numeric(8,3),
  amount      numeric(14,2) not null default 0,
  taxable     boolean not null default true,   -- kind='custom' only
  sort_order  int not null default 0
);

create index if not exists invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Invoice numbering — {short_code}{FY}-{0000}, e.g. GR2425-0005
--
-- Per company, resets each Indian financial year (April–March). The counter
-- row is the lock: the INSERT ... ON CONFLICT DO UPDATE takes a row lock for
-- the transaction, so concurrent inserts serialise and each gets its own seq.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.invoice_counters (
  company_id bigint not null references public.companies(id),
  fy         text   not null,
  last_seq   int    not null default 0,
  primary key (company_id, fy)
);

-- '2024-10-01' -> '2425'.  Jan–Mar belong to the year that started last April.
create or replace function public.financial_year_code(d date)
returns text
language sql immutable
as $$
  select case when extract(month from d) >= 4
    then to_char(d, 'YY') || to_char(d + interval '1 year', 'YY')
    else to_char(d - interval '1 year', 'YY') || to_char(d, 'YY')
  end
$$;

create or replace function public.assign_invoice_number()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  -- v_ prefix is load-bearing: a variable named `fy` is ambiguous against
  -- invoice_counters.fy inside the INSERT below and raises 42702 at runtime.
  v_fy   text;
  v_seq  int;
  v_code text;
begin
  if new.invoice_number is not null and new.invoice_number <> '' then
    return new;                                   -- caller supplied one
  end if;

  v_fy := public.financial_year_code(coalesce(new.invoice_date, current_date));

  insert into public.invoice_counters (company_id, fy, last_seq)
  values (new.company_id, v_fy, 1)
  on conflict (company_id, fy)
    do update set last_seq = public.invoice_counters.last_seq + 1
  returning last_seq into v_seq;

  select short_code into v_code from public.companies where id = new.company_id;

  new.invoice_number := coalesce(v_code, 'INV') || v_fy || '-' || lpad(v_seq::text, 4, '0');
  return new;
end $$;

drop trigger if exists set_invoice_number on public.invoices;
create trigger set_invoice_number
  before insert on public.invoices
  for each row execute function public.assign_invoice_number();

-- What the number WOULD be, without consuming it. The Create invoice form
-- shows this before save; the trigger above assigns the real one.
create or replace function public.peek_next_invoice_number(d date default current_date)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(c.short_code, 'INV')
      || public.financial_year_code(d)
      || '-'
      || lpad((coalesce(ic.last_seq, 0) + 1)::text, 4, '0')
  from public.companies c
  left join public.invoice_counters ic
    on ic.company_id = c.id
   and ic.fy = public.financial_year_code(d)
  where c.id = public.current_company_id()
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Tenancy
-- ═══════════════════════════════════════════════════════════════════════════

-- company_id is immutable — reuses the guard from 020.
drop trigger if exists guard_company_id on public.invoices;
create trigger guard_company_id
  before update on public.invoices
  for each row execute function public.guard_company_id_immutable();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists invoices_touch_updated_at on public.invoices;
create trigger invoices_touch_updated_at
  before update on public.invoices
  for each row execute function public.touch_updated_at();

-- A. Direct
alter table public.invoices enable row level security;
drop policy if exists "company scoped" on public.invoices;
create policy "company scoped" on public.invoices for all
  using      (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- B. Derived — the parent's policy filters the subquery, so scoping is
-- inherited and cannot drift.
alter table public.invoice_bookings enable row level security;
drop policy if exists "scoped via invoice" on public.invoice_bookings;
create policy "scoped via invoice" on public.invoice_bookings for all
  using      (invoice_id in (select id from public.invoices))
  with check (invoice_id in (select id from public.invoices));

alter table public.invoice_lines enable row level security;
drop policy if exists "scoped via invoice" on public.invoice_lines;
create policy "scoped via invoice" on public.invoice_lines for all
  using      (invoice_id in (select id from public.invoices))
  with check (invoice_id in (select id from public.invoices));

-- Counters are written only by the security-definer trigger. No client policy
-- means no client read or write, which is what we want.
alter table public.invoice_counters enable row level security;

-- ── Verify ─────────────────────────────────────────────────────────────────
--   select tablename, policyname from pg_policies
--    where schemaname = 'public' and tablename like 'invoice%';
--   select public.peek_next_invoice_number();
