-- ═══════════════════════════════════════════════════════════════════════════
-- 031 — Locations
--
-- From/To on a booking was a hardcoded const in src/lib/locations.ts, so adding
-- a locality meant a commit and a deploy. Operators need to add one mid-booking
-- without losing a half-filled drawer, so it becomes data.
--
-- SHARED across tenants, not company-scoped — same call as customers in 020
-- ("shared book"). Geography is universal; nobody should re-enter Andheri.
-- The trade-off accepted: one tenant's new location is visible to all, so the
-- citext unique index below is the only thing stopping 'nerul' / 'Nerul' /
-- 'NERUL' becoming three rows everyone has to scroll past. The trim CHECK
-- closes the whitespace half of that, which citext alone does not.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists citext;

create table if not exists public.locations (
  id         bigint generated always as identity primary key,
  name       citext not null unique,
  created_at timestamptz not null default now(),
  -- citext folds case but NOT whitespace: without this, 'Nerul' and 'NERUL '
  -- are two rows. Verified against the live table before the constraint existed.
  constraint locations_name_trimmed
    check (name::text = btrim(name::text) and length(name::text) > 0)
);

alter table public.locations enable row level security;

-- Mirrors the customers policy exactly: any signed-in user with an active
-- company reads and writes; a user with no company_members row sees nothing.
drop policy if exists "shared book" on public.locations;
create policy "shared book" on public.locations
  for all to authenticated
  using      (current_company_id() is not null)
  with check (current_company_id() is not null);

-- Seed: the 6 original dropdown cities plus the 56 distinct Source/Destination
-- values from the client's trip settlement export, kept verbatim so imported
-- bookings round-trip back to the source file.
insert into public.locations (name) values
  ('Airoli'),
  ('Andheri'),
  ('Bandra'),
  ('Bangalore'),
  ('Belapur CBD'),
  ('Bevarly Park'),
  ('Bhandup'),
  ('Bombay Central'),
  ('Borivali'),
  ('Byculla'),
  ('CST'),
  ('Chembur'),
  ('Chennai'),
  ('Chunabhatti'),
  ('Churchgate'),
  ('Colaba'),
  ('Dadar'),
  ('Delhi'),
  ('Domestic Airport'),
  ('Ghansoli'),
  ('Girgaon'),
  ('Grant Road'),
  ('Hyderabad'),
  ('International Airport'),
  ('Kandivali'),
  ('Khar'),
  ('Kharghar'),
  ('Kolhapur Others'),
  ('Koparkhairne'),
  ('Kurla'),
  ('Lower Parel'),
  ('Mahalakshmi'),
  ('Maker Chamber'),
  ('Marine Lines'),
  ('Marol'),
  ('Matunga'),
  ('Mulund'),
  ('Mumbai'),
  ('Mumbai Central'),
  ('Nagothane'),
  ('Nariman Point'),
  ('Panvel'),
  ('Parel'),
  ('Pedder Road'),
  ('Powai'),
  ('Pune'),
  ('Pune Others'),
  ('Pune city'),
  ('Reliance Corporate Park'),
  ('Santa Cruz'),
  ('Seawood Darave'),
  ('Sewri'),
  ('Sion'),
  ('Thane'),
  ('Turbhe'),
  ('Vashi'),
  ('Vikroli'),
  ('Vile Parle'),
  ('Wadala'),
  ('Walkeshwar'),
  ('Worli'),
  ('Other')
on conflict (name) do nothing;
