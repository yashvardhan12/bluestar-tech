-- ── Team Members ──────────────────────────────────────────────────────────────

create table if not exists team_members (
  id           bigserial primary key,
  name         text      not null,
  phone_number text      not null,
  email        text,
  address      text,
  notes        text,
  role         text      not null default 'Staff'
                         check (role in ('Owner', 'Admin', 'Manager', 'Staff')),
  created_at   timestamptz not null default now()
);

-- ── Companies ─────────────────────────────────────────────────────────────────

create table if not exists companies (
  id                  bigserial primary key,
  name                text      not null,
  phone_number        text      not null,
  email               text,
  address             text,
  -- Details accordion
  business_type       text,
  gstin_number        text,
  service_tax_number  text,
  cin_number          text,
  cst_tin_number      text,
  -- Extra fields
  duty_slip_terms     text,
  signature_url       text,
  notes               text,
  created_at          timestamptz not null default now()
);

-- ── User Profile (Account tab) ────────────────────────────────────────────────

create table if not exists user_profiles (
  id          bigserial primary key,
  first_name  text not null default '',
  last_name   text not null default '',
  email       text not null default '',
  role        text not null default '',          -- job title e.g. "Operations Manager"
  access_type text not null default 'Owner'
              check (access_type in ('Owner', 'Admin', 'Manager', 'Staff')),
  created_at  timestamptz not null default now()
);

-- Seed a default profile row so Account tab always has something to display
insert into user_profiles (first_name, last_name, email, role, access_type)
values ('', '', '', '', 'Owner')
on conflict do nothing;
