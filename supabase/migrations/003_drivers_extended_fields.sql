-- Extend drivers table with full profile fields
alter table public.drivers
  add column if not exists date_of_birth    date,
  add column if not exists pan_number       text,
  add column if not exists aadhaar_number   text,
  add column if not exists driver_license   text,
  add column if not exists address_type     text,
  add column if not exists address          text,
  add column if not exists salary_per_month numeric(12,2),
  add column if not exists daily_wages      numeric(12,2),
  add column if not exists shift_start_time time,
  add column if not exists shift_end_time   time,
  add column if not exists off_day          text,
  add column if not exists attach_document_url text;

-- Drop the old license_number column that was added in 002 (superseded by driver_license)
alter table public.drivers
  drop column if exists license_number;
