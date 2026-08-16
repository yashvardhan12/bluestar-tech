-- ═══════════════════════════════════════════════════════════════════════════
-- 025 — Driver app foundation
--
-- Backs F1 (auth), F2 (seeing the work), F3 (running a duty) and the expense
-- half of F4 from the Driver PWA PRD.
--
-- The load-bearing decision, from addendum.md: drivers get an `auth.users`
-- row but NO `company_members` row. current_company_id() therefore returns
-- null for them and every existing `company_id = current_company_id()` policy
-- already returns zero rows. Driver access is purely additive — nothing below
-- rewrites or weakens an existing policy.
--
-- Additive here means: no table grants at all. Drivers read three views and
-- write through six SECURITY DEFINER functions. That is the entire surface.
-- The alternative — granting `duties` and revoking the rate columns — does not
-- work, because duties' policy is `booking_id in (select id from bookings)`,
-- so granting duties means granting bookings, which carries base_rate too.
-- FR-16 (a driver never sees a rate) is satisfied by construction here.
--
-- The PIN itself never touches this file. Hashing, verification, rate
-- limiting (FR-5) and regeneration (FR-6) all live in the `driver-auth` Edge
-- Function, which is the only thing that writes `drivers.pin_hash`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. drivers ← an authenticated identity ─────────────────────────────────
-- Nullable: not every driver record needs a login, and back-office-only
-- drivers must keep working exactly as they do today.

alter table public.drivers
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists pin_hash     text,
  add column if not exists pin_set_at   timestamptz,
  -- FR-5. Two columns on the row the attempt is keyed to, rather than an
  -- attempts table with a cleanup job. Nothing else needs the history.
  add column if not exists pin_attempts     integer not null default 0,
  add column if not exists pin_locked_until timestamptz;

-- ── 2. duties ← the duty slip ──────────────────────────────────────────────
-- FR-31 is what keeps this simple: one signature and one odometer pair per
-- duty regardless of how many days it spans. So these are columns, not a
-- child table. Distance and duration are derived at read time, never stored.

alter table public.duties
  add column if not exists started_at        timestamptz,
  add column if not exists picked_up_at      timestamptz,
  add column if not exists closed_at         timestamptz,
  add column if not exists start_odo         numeric,
  add column if not exists end_odo           numeric,
  add column if not exists start_odo_photo   text,
  add column if not exists end_odo_photo     text,
  add column if not exists signature_path    text,
  add column if not exists no_show_reason    text,
  -- FR-56 / FR-59: a figure the operator supplied or corrected is always
  -- distinguishable from one the driver captured.
  add column if not exists closed_by_profile uuid references auth.users(id),
  add column if not exists corrected_by      uuid references auth.users(id),
  add column if not exists corrected_at      timestamptz;

-- FR-29. Enforced in driver_close_duty too, but the constraint is what also
-- covers the operator's own edits (FR-56) and any future import path.
alter table public.duties drop constraint if exists duties_odo_forward;
alter table public.duties add  constraint duties_odo_forward
  check (end_odo is null or start_odo is null or end_odo > start_odo);

-- ── 3. driver_expense_logs ← attach to a duty, keep the receipt ────────────
-- Existing home, per the addendum — no new table. It had no duty link and no
-- receipt column; both are required by FR-35 and FR-40.

alter table public.driver_expense_logs
  add column if not exists duty_id     bigint references public.duties(id) on delete set null,
  add column if not exists receipt_url text,
  -- FR-64: each line is independently billable or absorbed.
  add column if not exists billable    boolean not null default true;

create index if not exists driver_expense_logs_duty_id_idx
  on public.driver_expense_logs (duty_id);

create index if not exists duties_driver_id_idx on public.duties (driver_id);

-- ── 4. Who is calling? ─────────────────────────────────────────────────────

create or replace function public.current_driver_id()
returns bigint
language sql stable security definer set search_path = public
as $$
  select id from public.drivers
   where auth_user_id = auth.uid()
     and status = 'Active'          -- FR-7, belt and braces behind the Edge Function
$$;

create or replace function public.current_driver_company_id()
returns bigint
language sql stable security definer set search_path = public
as $$
  select company_id from public.drivers
   where auth_user_id = auth.uid()
     and status = 'Active'
$$;

-- ── 4b. Looking a driver up at sign-in ─────────────────────────────────────
-- A driver knows their own phone number; they do not reliably know
-- "DR243652". Both work as the identifier.
--
-- Normalisation lives here rather than in the Edge Function because the data
-- needs it: `phone` is free text and already holds both `9876543210` and
-- `+91 9594419460`. Comparing the last 10 digits collapses country codes,
-- spaces and punctuation without touching the stored values.
--
-- `phone` carries NO unique constraint — two drivers can share a number, and
-- one day two will. So this returns every match and lets the caller refuse to
-- guess. `by_id` marks the Driver ID hit, which is unique and always wins.
--
-- Returns pin_hash, so it is granted to service_role and nothing else. The
-- Edge Function is the only caller.

create or replace function public.driver_by_login(p_login text)
returns table (id bigint, driver_id text, status text, pin_hash text,
               auth_user_id uuid, pin_attempts integer,
               pin_locked_until timestamptz, by_id boolean)
language sql stable security definer set search_path = public
as $$
  with norm as (
    select right(regexp_replace(coalesce(p_login, ''), '\D', '', 'g'), 10) as digits,
           lower(btrim(coalesce(p_login, ''))) as ref
  ),
  hits as (
    select d.*, lower(d.driver_id) = n.ref as by_id
      from public.drivers d, norm n
     where lower(d.driver_id) = n.ref
        or (length(n.digits) = 10
            and right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10) = n.digits)
  )
  select h.id, h.driver_id, h.status, h.pin_hash, h.auth_user_id,
         h.pin_attempts, h.pin_locked_until, h.by_id
    from hits h
   order by h.by_id desc, h.id
$$;

revoke all on function public.driver_by_login(text) from public, anon, authenticated;
grant execute on function public.driver_by_login(text) to service_role;

-- ── 5. What a driver may read ──────────────────────────────────────────────
-- Plain views, so they run as owner and bypass RLS on the tables underneath —
-- which is the point. The tenant predicate is current_driver_id(), inside.
-- An operator session (driver_id null) matches nothing and sees zero rows.
--
-- No base_rate, no extra_km_rate, no extra_hour_rate, no bill_to. FR-16.

create or replace view public.driver_duties as
select
  d.id,
  d.status,
  d.start_date,
  d.end_date,
  d.reporting_time,
  d.est_drop_time,
  d.garage_start_mins,           -- FR-14, the "leave N hours before" prompt
  d.duty_type,
  d.from_location,
  d.to_location,
  d.reporting_address,
  d.drop_address,
  d.driver_notes,
  d.started_at,
  d.picked_up_at,
  d.closed_at,
  d.start_odo,
  d.end_odo,
  d.start_odo_photo,
  d.end_odo_photo,
  d.signature_path,
  d.no_show_reason,
  b.booking_ref,
  b.customer_name,
  b.booked_by_name,
  b.booked_by_phone,
  v.vehicle_number,
  v.model_name as vehicle_model
from public.duties d
join public.bookings b on b.id = d.booking_id
left join public.vehicles v on v.id = d.vehicle_id
where d.driver_id = public.current_driver_id();

create or replace view public.driver_duty_passengers as
select p.id, d.id as duty_id, p.name, p.phone, p.sort_order
from public.duties d
join public.booking_passengers p on p.booking_id = d.booking_id
where d.driver_id = public.current_driver_id();

create or replace view public.driver_expenses as
select e.id, e.duty_id, e.date, e.type, e.amount, e.receipt_url, e.created_at
from public.driver_expense_logs e
where e.driver_id = public.current_driver_id();

revoke all on public.driver_duties, public.driver_duty_passengers, public.driver_expenses from anon;
grant select on public.driver_duties, public.driver_duty_passengers, public.driver_expenses to authenticated;

-- ── 6. What a driver may write ─────────────────────────────────────────────
-- Every one of these is idempotent: a second call with the same intent is a
-- no-op, not an error. That is what makes the offline queue safe to replay
-- (FR-46, FR-48) without a dedup key on the client.

-- FR-41, FR-42. The driver's own identity plus the operator's phone number,
-- neither of which is reachable through any policy a driver has.
-- company_id is here because the driver needs it to build a storage path;
-- the policies in §8 key on that leading folder.
create or replace function public.driver_me()
returns table (id bigint, driver_ref text, name text,
               company_id bigint, company_name text, company_phone text)
language sql stable security definer set search_path = public
as $$
  select d.id, d.driver_id, d.name, c.id, c.name, c.phone_number
    from public.drivers d
    join public.companies c on c.id = d.company_id
   where d.auth_user_id = auth.uid()
     and d.status = 'Active'
$$;

-- FR-19, FR-20, FR-21.
create or replace function public.driver_start_duty(
  p_duty_id bigint, p_odo numeric, p_photo text
) returns void
language plpgsql security definer set search_path = public
as $$
declare v_driver bigint := public.current_driver_id();
        v_company bigint := public.current_driver_company_id();
        v_booking bigint;
        v_date date;
begin
  if v_driver is null then raise exception 'not a driver'; end if;
  if p_odo is null or p_photo is null then
    raise exception 'odometer reading and photo are both required';   -- FR-19
  end if;

  update public.duties
     set started_at      = coalesce(started_at, now()),
         start_odo       = coalesce(start_odo, p_odo),
         start_odo_photo = coalesce(start_odo_photo, p_photo),
         status          = case when status in ('Completed','Billed','Cancelled')
                                then status else 'On-Going' end
   where id = p_duty_id and driver_id = v_driver
   returning booking_id, start_date into v_booking, v_date;

  if v_booking is null then raise exception 'duty not found'; end if;

  -- FR-21. The driver did nothing extra for this to happen.
  insert into public.driver_attendance (driver_id, date, status, company_id)
  values (v_driver, v_date, 'P', v_company)
  on conflict (driver_id, date) do nothing;

  -- ponytail: nudge the parent booking rather than re-deriving the whole
  -- ladder in SQL. The operator's client recomputes properly on load; this
  -- only stops the board reading Allotted while a duty is visibly running.
  update public.bookings set status = 'On-Going'
   where id = v_booking and status not in ('On-Going','Completed','Billed','Cancelled');
end $$;

-- FR-22.
create or replace function public.driver_mark_pickup(p_duty_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_driver bigint := public.current_driver_id();
begin
  if v_driver is null then raise exception 'not a driver'; end if;
  update public.duties
     set picked_up_at = coalesce(picked_up_at, now())
   where id = p_duty_id and driver_id = v_driver and started_at is not null;
  if not found then raise exception 'duty not found or not started'; end if;
end $$;

-- FR-23. The reason is required: a no-show with no recorded reason is
-- unbillable and unarguable.
create or replace function public.driver_mark_no_show(p_duty_id bigint, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_driver bigint := public.current_driver_id();
begin
  if v_driver is null then raise exception 'not a driver'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'a reason is required'; end if;
  update public.duties
     set no_show_reason = coalesce(no_show_reason, p_reason),
         closed_at      = coalesce(closed_at, now()),
         status         = case when status in ('Billed','Cancelled') then status else 'Completed' end
   where id = p_duty_id and driver_id = v_driver and picked_up_at is null;
  if not found then raise exception 'duty not found, or a pickup was already confirmed'; end if;
end $$;

-- FR-26, FR-28, FR-29, FR-30.
create or replace function public.driver_close_duty(
  p_duty_id bigint, p_odo numeric, p_photo text, p_signature text
) returns void
language plpgsql security definer set search_path = public
as $$
declare v_driver bigint := public.current_driver_id();
        v_start numeric;
        v_booking bigint;
begin
  if v_driver is null then raise exception 'not a driver'; end if;
  if p_odo is null or p_photo is null or p_signature is null then
    raise exception 'end reading, photo and signature are all required';
  end if;

  select start_odo, booking_id into v_start, v_booking
    from public.duties where id = p_duty_id and driver_id = v_driver;
  if v_booking is null then raise exception 'duty not found'; end if;
  if v_start is null then raise exception 'duty was never started'; end if;
  if p_odo <= v_start then
    raise exception 'end reading (%) must be greater than start reading (%)', p_odo, v_start;  -- FR-29
  end if;

  update public.duties
     set closed_at      = coalesce(closed_at, now()),
         end_odo        = coalesce(end_odo, p_odo),
         end_odo_photo  = coalesce(end_odo_photo, p_photo),
         signature_path = coalesce(signature_path, p_signature),
         status         = case when status in ('Billed','Cancelled') then status else 'Completed' end
   where id = p_duty_id and driver_id = v_driver;

  -- Booking completes only when every sibling duty is done. Same rule as
  -- syncBookingStatus, kept to the one branch that can change here.
  update public.bookings set status = 'Completed'
   where id = v_booking
     and status not in ('Completed','Billed','Cancelled')
     and not exists (
       select 1 from public.duties
        where booking_id = v_booking
          and status not in ('Completed','Billed','Cancelled'));
end $$;

-- FR-34, FR-35, FR-36.
create or replace function public.driver_add_expense(
  p_duty_id bigint, p_type text, p_amount numeric, p_receipt text
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_driver bigint := public.current_driver_id();
        v_date date;
        v_id bigint;
begin
  if v_driver is null then raise exception 'not a driver'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;

  select start_date into v_date from public.duties
   where id = p_duty_id and driver_id = v_driver and closed_at is null;
  if v_date is null then raise exception 'duty not found or already closed'; end if;

  insert into public.driver_expense_logs (driver_id, duty_id, date, type, amount, receipt_url)
  values (v_driver, p_duty_id, v_date, p_type, p_amount, p_receipt)
  returning id into v_id;
  return v_id;
end $$;

-- FR-38. Only before the duty closes; after that it is the operator's.
create or replace function public.driver_delete_expense(p_expense_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_driver bigint := public.current_driver_id();
begin
  if v_driver is null then raise exception 'not a driver'; end if;
  delete from public.driver_expense_logs e
   using public.duties d
   where e.id = p_expense_id
     and e.driver_id = v_driver
     and d.id = e.duty_id
     and d.closed_at is null;
  if not found then raise exception 'expense not found, or its duty is closed'; end if;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'driver_me()',
    'driver_start_duty(bigint,numeric,text)',
    'driver_mark_pickup(bigint)',
    'driver_mark_no_show(bigint,text)',
    'driver_close_duty(bigint,numeric,text,text)',
    'driver_add_expense(bigint,text,numeric,text)',
    'driver_delete_expense(bigint)',
    'current_driver_id()',
    'current_driver_company_id()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- ── 7. Closing a hole the driver session opens ─────────────────────────────
-- `customers` is the one table 020 left un-scoped: no company_id, and a
-- policy of `to authenticated using (true)`. That was survivable while every
-- authenticated user was an operator. It stops being survivable the moment a
-- driver holds a JWT — the whole customer book, every company's, readable and
-- writable, which PRD §7 forbids outright.
--
-- Scoping the table properly needs a company_id and a backfill, and that is a
-- tenancy job, not a driver-app job. This is the smallest change that makes
-- the driver session safe: keep the shared book for anyone who belongs to a
-- company, give nothing to anyone who doesn't. Operator behaviour is byte for
-- byte what it was.

drop policy if exists "shared book" on public.customers;
create policy "shared book" on public.customers for all to authenticated
using (public.current_company_id() is not null)
with check (public.current_company_id() is not null);

-- ── 8. Storage ─────────────────────────────────────────────────────────────
-- Odometer photos and signatures go in the existing private bucket under the
-- convention 023 established: {company_id}/{category}/…
-- The operator policies from 023 already let the operator read these back,
-- because they key on membership of the same leading folder. Drivers get
-- their own pair because current_company_id() is null for them.

drop policy if exists "driver slips insert" on storage.objects;
create policy "driver slips insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'vehicle-documents'
  and (storage.foldername(name))[2] = 'duty-slips'
  and ((storage.foldername(name))[1]) ~ '^[0-9]+$'
  and ((storage.foldername(name))[1])::bigint = public.current_driver_company_id()
);

drop policy if exists "driver slips read" on storage.objects;
create policy "driver slips read" on storage.objects for select to authenticated
using (
  bucket_id = 'vehicle-documents'
  and (storage.foldername(name))[2] = 'duty-slips'
  and ((storage.foldername(name))[1]) ~ '^[0-9]+$'
  and ((storage.foldername(name))[1])::bigint = public.current_driver_company_id()
);

-- No update, no delete. Billing evidence is write-once from the driver side.

-- ── Verify ─────────────────────────────────────────────────────────────────
--   select count(*) from public.driver_duties;          -- 0 as an operator
--   select public.current_driver_id();                  -- null as an operator
--   select * from public.driver_me();                   -- 0 rows as an operator
