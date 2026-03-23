-- Vehicle Groups
create table if not exists public.vehicle_groups (
  id               bigint generated always as identity primary key,
  name             text not null,
  description      text,
  seating_capacity integer,
  luggage_count    integer,
  total_vehicles   integer not null default 0,
  created_at       timestamptz not null default now()
);

-- Vehicles
create table if not exists public.vehicles (
  id                  bigint generated always as identity primary key,
  model_name          text not null,
  vehicle_number      text not null unique,
  fuel_type           text,
  vehicle_group_id    bigint references public.vehicle_groups(id) on delete set null,
  assigned_driver_id  bigint,                          -- will reference drivers table later
  fastag_number       text,
  status              text not null default 'Active' check (status in ('Active','Inactive','Assigned')),
  reg_owner_name      text,
  reg_date            date,
  ins_company         text,
  ins_policy_number   text,
  ins_issue_date      date,
  ins_due_date        date,
  ins_premium         numeric(12,2),
  ins_cover           numeric(12,2),
  rto_owner_name      text,
  rto_reg_date        date,
  chassis_number      text,
  engine_number       text,
  car_expiry_date     date,
  has_loan            boolean not null default false,
  loan_emi_amount     numeric(12,2),
  loan_start_date     date,
  loan_end_date       date,
  loan_bank_name      text,
  loan_emi_date       integer,          -- day of month (1–31)
  notes               text,
  created_at          timestamptz not null default now()
);

-- Enable Row Level Security (open policy for now — tighten once auth is added)
alter table public.vehicle_groups enable row level security;
alter table public.vehicles       enable row level security;

create policy "Allow all" on public.vehicle_groups for all using (true) with check (true);
create policy "Allow all" on public.vehicles       for all using (true) with check (true);

-- Seed vehicle groups
insert into public.vehicle_groups (name, total_vehicles) values
  ('Toyota Innova',       2),
  ('Dzire/Amaze/Etios',   3),
  ('Nissan Hatchbacks',   2),
  ('MG Hector/MG Titan',  4),
  ('Mercedes Sedans',     5),
  ('Toyota Sedans',       1),
  ('Maruti Hatchbacks',   2),
  ('Maruti SUVs',         4),
  ('Honda City',          3),
  ('Hyundai Creta',       6);
