-- ═══════════════════════════════════════════════════════════════════════════
-- 020 — Scope the existing 15 tables to companies
--
-- Three scoping flavours, decided by the FK graph:
--
--   A. Own company_id column (10) — top-level entities, plus three tables that
--      cannot safely derive: vehicle_expenses and fuel_logs have NO foreign
--      keys (they reference vehicles by text), and driver_attendance.driver_id
--      is NULLABLE, so a derived policy would let null-driver rows escape.
--
--   B. Derived from parent (4) — the parent's RLS already filters, so a
--      subquery inherits it. No column, no backfill, and it cannot drift out
--      of sync with its parent the way a denormalised copy would.
--
--   C. Shared (1) — customers, per the shared-customer-book decision.
--
-- Existing data is 12 rows total; all backfills land in the seed company.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── company_id is immutable ────────────────────────────────────────────────
-- Without this, one careless UPDATE moves a booking — and its duties, its
-- passengers, its invoices — into another tenant.

create or replace function public.guard_company_id_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'company_id is immutable (table %)', tg_table_name;
  end if;
  return new;
end $$;

-- ── A. Direct scoping ──────────────────────────────────────────────────────

do $$
declare
  t    text;
  seed bigint;
  direct_tables text[] := array[
    'bookings', 'drivers', 'vehicles', 'vehicle_groups', 'duty_types',
    'taxes', 'bank_accounts', 'vehicle_expenses', 'fuel_logs', 'driver_attendance'
  ];
begin
  select min(id) into seed from public.companies;
  if seed is null then
    raise exception '019 must run first — no seed company exists';
  end if;

  foreach t in array direct_tables loop
    -- 1. add nullable
    execute format(
      'alter table public.%I add column if not exists company_id bigint references public.companies(id)', t);

    -- 2. backfill BEFORE the default exists (backfill has no auth context,
    --    so current_company_id() would return null here)
    execute format('update public.%I set company_id = %L where company_id is null', t, seed);

    -- 3. lock it down
    execute format('alter table public.%I alter column company_id set not null', t);

    -- 4. stamp future inserts automatically — this is why the existing ~143
    --    query sites need no change: they all omit the column, so the default
    --    fires. A null active company yields null here -> not-null violation
    --    -> writes fail closed.
    execute format(
      'alter table public.%I alter column company_id set default public.current_company_id()', t);

    -- 5. index (every policy filters on it)
    execute format('create index if not exists %I on public.%I (company_id)', t || '_company_idx', t);

    -- 6. immutability
    execute format('drop trigger if exists guard_company_id on public.%I', t);
    execute format(
      'create trigger guard_company_id before update on public.%I
         for each row execute function public.guard_company_id_immutable()', t);

    -- 7. replace the wide-open policy
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Allow all" on public.%I', t);
    execute format('drop policy if exists "company scoped" on public.%I', t);
    execute format(
      'create policy "company scoped" on public.%I for all
         using (company_id = public.current_company_id())
         with check (company_id = public.current_company_id())', t);
  end loop;
end $$;

-- ── B. Derived scoping ─────────────────────────────────────────────────────
-- Each parent FK is NOT NULL, and the parent table's own policy filters the
-- subquery, so scoping is inherited automatically and can never drift.

alter table public.booking_passengers   enable row level security;
alter table public.duties               enable row level security;
alter table public.driver_payroll       enable row level security;
alter table public.driver_expense_logs  enable row level security;

drop policy if exists "Allow all" on public.booking_passengers;
drop policy if exists "Allow all" on public.duties;
drop policy if exists "Allow all" on public.driver_payroll;
drop policy if exists "Allow all" on public.driver_expense_logs;

drop policy if exists "scoped via booking" on public.booking_passengers;
create policy "scoped via booking" on public.booking_passengers for all
  using      (booking_id in (select id from public.bookings))
  with check (booking_id in (select id from public.bookings));

drop policy if exists "scoped via booking" on public.duties;
create policy "scoped via booking" on public.duties for all
  using      (booking_id in (select id from public.bookings))
  with check (booking_id in (select id from public.bookings));

drop policy if exists "scoped via driver" on public.driver_payroll;
create policy "scoped via driver" on public.driver_payroll for all
  using      (driver_id in (select id from public.drivers))
  with check (driver_id in (select id from public.drivers));

drop policy if exists "scoped via driver" on public.driver_expense_logs;
create policy "scoped via driver" on public.driver_expense_logs for all
  using      (driver_id in (select id from public.drivers))
  with check (driver_id in (select id from public.drivers));

create index if not exists duties_booking_idx              on public.duties (booking_id);
create index if not exists booking_passengers_booking_idx  on public.booking_passengers (booking_id);
create index if not exists driver_payroll_driver_idx       on public.driver_payroll (driver_id);
create index if not exists driver_expense_logs_driver_idx  on public.driver_expense_logs (driver_id);

-- ── C. Shared ──────────────────────────────────────────────────────────────
-- Customers are a shared book across all companies under the parent. Any
-- signed-in user reaches them; anonymous callers do not.

alter table public.customers enable row level security;
drop policy if exists "Allow all"  on public.customers;
drop policy if exists "shared book" on public.customers;
create policy "shared book" on public.customers for all
  to authenticated
  using (true) with check (true);

-- ── Verify ─────────────────────────────────────────────────────────────────
-- Every public table should now have RLS on and no "Allow all" policy left.
--
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public' order by tablename;
--
--   select relname, relrowsecurity from pg_class
--    where relnamespace = 'public'::regnamespace and relkind = 'r';
--
-- Expected: 15 operational tables + 3 tenancy tables, RLS enabled on all,
-- zero policies named "Allow all".
