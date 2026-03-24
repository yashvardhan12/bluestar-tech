-- Drivers
create table if not exists public.drivers (
  id          bigint generated always as identity primary key,
  name        text not null,
  initials    text not null,
  driver_id   text not null unique,
  phone       text,
  email       text,
  status      text not null default 'Active'
                check (status in ('Active','Inactive','Available','Assigned','Unavailable')),
  notes       text,
  created_at  timestamptz not null default now()
);

alter table public.drivers enable row level security;
create policy "Allow all" on public.drivers for all using (true) with check (true);

-- Wire the FK that was left as a plain bigint in schema.sql
alter table public.vehicles
  add constraint if not exists vehicles_assigned_driver_fkey
  foreign key (assigned_driver_id) references public.drivers(id) on delete set null;

-- Seed drivers (matching mock data used elsewhere in the app)
insert into public.drivers (name, initials, driver_id, phone, status) values
  ('John Dukes',         'JD', 'BLUDRIVER01', '(907) 248-8330', 'Active'),
  ('Kurt Bates',         'KB', 'BLUDRIVER02', '(602) 309-9604', 'Inactive'),
  ('Autumn Phillips',    'AP', 'BLUDRIVER03', '(813) 752-5611', 'Available'),
  ('David Elson',        'DE', 'BLUDRIVER04', '(301) 580-7410', 'Assigned'),
  ('Mary Freund',        'MF', 'BLUDRIVER05', '(818) 313-7673', 'Unavailable'),
  ('Ricky Smith',        'RS', 'BLUDRIVER06', '(904) 335-2403', 'Active'),
  ('Chris Glasser',      'CG', 'BLUDRIVER07', '(303) 420-4261', 'Active'),
  ('Bradley Lawlor',     'BL', 'BLUDRIVER08', '(267) 739-6240', 'Active'),
  ('Ronald Richards',    'RR', 'BLUDRIVER09', '(319) 555-0115', 'Active'),
  ('Brooklyn Simmons',   'BS', 'BLUDRIVER10', '(307) 555-0133', 'Available');
