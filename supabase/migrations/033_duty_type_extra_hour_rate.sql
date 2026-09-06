-- 033 — Monthly duty types carry a per-hour rate for hours past 12.
--
-- Named to match bookings.extra_hour_rate, which already exists and is still
-- entered by hand (see the note at the top of src/lib/invoice.ts). This is the
-- master-data default that column should eventually be filled from.
--
-- rate_12_plus_hrs is deliberately NOT reused: on Hourly it is the base rate
-- for a duty that ran 12+ hours, not a per-hour charge.
alter table public.duty_types
  add column if not exists extra_hour_rate numeric(12,2);
