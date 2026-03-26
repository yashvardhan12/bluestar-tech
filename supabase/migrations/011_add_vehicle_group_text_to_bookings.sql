alter table public.bookings
  add column if not exists vehicle_group text;
