-- ═══════════════════════════════════════════════════════════════════════════
-- 019 — Multi-tenancy core
--
-- Supersedes 014_create_settings.sql, which was committed but NEVER APPLIED.
-- Delete that file after this runs; its team_members shape does not survive
-- the move to auth-backed profiles.
--
-- Creates: companies, profiles, company_members
-- Plus the helper functions, triggers and grants that make tenant isolation
-- hold. Table scoping happens in 020.
--
-- Rules referenced below are from EXPERIENCE.md § Multi-Tenancy Rules.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── companies (the tenant) ─────────────────────────────────────────────────

create table if not exists public.companies (
  id                 bigint generated always as identity primary key,
  name               text not null unique,          -- Rule 9: empty states quote the name
  short_code         text not null unique            -- Rule 5: badge shows this, never an initial
                     check (short_code ~ '^[A-Z0-9]{2,3}$'),
  phone_number       text not null,
  email              text,
  address            text,
  business_type      text,
  gstin_number       text,
  service_tax_number text,
  cin_number         text,
  cst_tin_number     text,
  duty_slip_terms    text,
  signature_url      text,
  notes              text,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id)
);

-- NOTE: deliberately no archived_at / no delete path (Rule 4, DEC-14).
-- Companies are create-and-edit only.

-- ── profiles (one per auth user) ───────────────────────────────────────────
-- Merges the old user_profiles + team_members into a single identity table.
-- job_title is free text ("Operations Manager"); role is the access level.

create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  first_name        text not null default '',
  last_name         text not null default '',
  email             text not null default '',
  job_title         text not null default '',
  role              text not null default 'Admin' check (role in ('Owner', 'Admin')),
  phone_number      text,
  address           text,
  notes             text,
  active_company_id bigint references public.companies(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ── membership ─────────────────────────────────────────────────────────────

create table if not exists public.company_members (
  company_id bigint not null references public.companies(id) on delete cascade,
  profile_id uuid   not null references public.profiles(id)  on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (company_id, profile_id)
);

create index if not exists company_members_profile_idx on public.company_members (profile_id);
create index if not exists company_members_company_idx on public.company_members (company_id);
create index if not exists profiles_active_company_idx on public.profiles (active_company_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Helper functions
--
-- All security definer so policies calling them do not re-enter RLS and
-- recurse. search_path pinned per Supabase security guidance.
-- ═══════════════════════════════════════════════════════════════════════════

-- Rule 7a — THE load-bearing function.
-- Returns the active company ONLY IF the caller is currently a member of it.
-- Setting profiles.active_company_id to an arbitrary value must grant nothing:
-- the client can already write that column, so membership is re-verified here
-- on every read. Resolves to NULL -> zero rows everywhere -> fails closed.
create or replace function public.current_company_id()
returns bigint
language sql stable security definer set search_path = public
as $$
  select p.active_company_id
  from public.profiles p
  where p.id = auth.uid()
    and exists (
      select 1 from public.company_members cm
      where cm.profile_id = p.id
        and cm.company_id = p.active_company_id
    )
$$;

-- Rule 6 — the switcher's count query reaches across companies you BELONG TO.
-- Exempt from active-company scoping, never from tenant scoping. The membership
-- predicate is inside the function; callers must not filter client-side.
create or replace function public.my_company_ids()
returns setof bigint
language sql stable security definer set search_path = public
as $$
  select cm.company_id from public.company_members cm where cm.profile_id = auth.uid()
$$;

create or replace function public.is_member_of(target bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.company_members
    where profile_id = auth.uid() and company_id = target
  )
$$;

create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.my_role() = 'Owner', false)
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Triggers
-- ═══════════════════════════════════════════════════════════════════════════

-- New auth user -> profile row. Replaces the browser-side insert at
-- SettingsPage.tsx:216, which minted access_type:'Owner' from the client.
-- role is NOT taken from any client payload; it defaults to 'Admin'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rule 8 — creating a company auto-joins its creator, same transaction.
-- The single exception to "nobody grants themselves access", and the thing
-- that stops an Owner creating a company they can never enter.
create or replace function public.autojoin_company_creator()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    insert into public.company_members (company_id, profile_id, created_by)
    values (new.id, auth.uid(), auth.uid())
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_company_created on public.companies;
create trigger on_company_created
  after insert on public.companies
  for each row execute function public.autojoin_company_creator();

-- Guard: only an Owner may change a role, and nobody may change their own.
create or replace function public.guard_role_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- No authenticated caller means this is a server-side context (SQL editor,
  -- migration, service_role) rather than a browser. Bootstrap runs here, and
  -- must be able to create the first Owner before any Owner exists.
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role then
    if not public.is_owner() then
      raise exception 'Only an Owner may change roles';
    end if;
    if new.id = auth.uid() then
      raise exception 'You cannot change your own role';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_role on public.profiles;
create trigger guard_profile_role
  before update on public.profiles
  for each row execute function public.guard_role_change();

-- Guard: the last Owner cannot be demoted or deleted. Without this, one
-- careless edit leaves an org nobody can administer.
create or replace function public.guard_last_owner()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (tg_op = 'DELETE' and old.role = 'Owner')
     or (tg_op = 'UPDATE' and old.role = 'Owner' and new.role <> 'Owner') then
    if (select count(*) from public.profiles where role = 'Owner') <= 1 then
      raise exception 'Cannot remove or demote the last Owner';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists guard_owner_count on public.profiles;
create trigger guard_owner_count
  before update or delete on public.profiles
  for each row execute function public.guard_last_owner();

-- ═══════════════════════════════════════════════════════════════════════════
-- Column-level grants
--
-- RLS is row-level and cannot stop a member editing one column of a row they
-- may otherwise edit. Role is therefore revoked at the grant level and moves
-- through an Owner-only RPC. This is what closes self-promotion.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles       enable row level security;
alter table public.companies      enable row level security;
alter table public.company_members enable row level security;

revoke update on public.profiles from authenticated;
grant  update (first_name, last_name, email, job_title, phone_number, address, notes, active_company_id)
  on public.profiles to authenticated;

-- Owner-only role changes, server-side.
create or replace function public.set_member_role(target uuid, new_role text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Only an Owner may change roles';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;
  if new_role not in ('Owner', 'Admin') then
    raise exception 'Unknown role: %', new_role;
  end if;
  update public.profiles set role = new_role where id = target;
end $$;

revoke all on function public.set_member_role(uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Policies on the tenancy tables themselves
-- ═══════════════════════════════════════════════════════════════════════════

-- companies: Owner manages every company record (management visibility).
-- Everyone else sees only companies they belong to. Note this is the MANAGEMENT
-- surface — operational data still requires membership (see 020).
drop policy if exists "companies read"   on public.companies;
drop policy if exists "companies insert" on public.companies;
drop policy if exists "companies update" on public.companies;

create policy "companies read" on public.companies for select
  using (public.is_owner() or id in (select public.my_company_ids()));

create policy "companies insert" on public.companies for insert
  with check (public.is_owner());          -- Rule 8: only Owners create

create policy "companies update" on public.companies for update
  using (public.is_owner()) with check (public.is_owner());

-- No delete policy at all — Rule 4. Deletion is impossible, not merely hidden.

-- profiles: see yourself, plus anyone sharing a company with you. Owner sees all.
drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles update" on public.profiles;

create policy "profiles read" on public.profiles for select
  using (
    id = auth.uid()
    or public.is_owner()
    or exists (
      select 1
      from public.company_members mine
      join public.company_members theirs on theirs.company_id = mine.company_id
      where mine.profile_id = auth.uid() and theirs.profile_id = public.profiles.id
    )
  );

-- Column grants above decide WHICH columns; this decides which rows.
create policy "profiles update" on public.profiles for update
  using (id = auth.uid() or public.is_owner())
  with check (id = auth.uid() or public.is_owner());

-- company_members: the grant surface. Never self-service.
drop policy if exists "members read"   on public.company_members;
drop policy if exists "members insert" on public.company_members;
drop policy if exists "members delete" on public.company_members;

create policy "members read" on public.company_members for select
  using (
    profile_id = auth.uid()
    or public.is_owner()
    or public.is_member_of(company_id)
  );

-- An Admin may grant access only to companies they themselves belong to,
-- and never to themselves. Owners may grant anywhere. The auto-join trigger
-- is security definer and bypasses this deliberately.
create policy "members insert" on public.company_members for insert
  with check (
    profile_id <> auth.uid()
    and (public.is_owner() or public.is_member_of(company_id))
  );

create policy "members delete" on public.company_members for delete
  using (
    profile_id <> auth.uid()
    and (public.is_owner() or public.is_member_of(company_id))
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Seed
-- ═══════════════════════════════════════════════════════════════════════════

-- A home for the 12 existing operational rows, backfilled in 020.
insert into public.companies (name, short_code, phone_number)
select 'Bluestar', 'BS', '+91 00000 00000'
where not exists (select 1 from public.companies);

-- ── BOOTSTRAP (manual, run once, after creating your first auth users) ─────
--
-- handle_new_user() creates every profile as 'Admin'. The first Owner cannot
-- be self-service — that was the hole at SettingsPage.tsx:216. Seed it here.
-- Seed TWO: only an Owner can promote an Owner, so a single lost login is
-- unrecoverable.
--
--   1. Create two users in Supabase Dashboard -> Authentication -> Users
--   2. Then run, with their real emails:
--
--      update public.profiles set role = 'Owner'
--       where email in ('you@bluestar.co.in', 'backup@bluestar.co.in');
--
--      insert into public.company_members (company_id, profile_id)
--      select c.id, p.id from public.companies c, public.profiles p
--       where p.role = 'Owner'
--      on conflict do nothing;
--
--      update public.profiles p set active_company_id = (select min(id) from public.companies)
--       where p.role = 'Owner';
--
-- The guard_role_change trigger blocks role edits by non-Owners, but the very
-- first promotion runs before any Owner exists — run it from the SQL editor,
-- which executes as a superuser and bypasses RLS.
