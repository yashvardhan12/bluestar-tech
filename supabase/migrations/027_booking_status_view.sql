-- 027 — Booking status as a derived view
--
-- Companion to 026. AllBookingsPage ran syncOnGoingStatuses() on every load:
-- a duties query plus a bulk UPDATE, on a read path. Booking status is an
-- aggregate over its duties, so it derives the same way.
--
-- Additive: `bookings.status` is untouched and still written by the
-- confirm / cancel / bill actions and by syncBookingStatus() after writes.
-- Reverting is `drop view public.bookings_status`.
--
-- Priority order is lifted from src/lib/bookingStatus.ts syncBookingStatus().

create or replace view public.bookings_status
with (security_invoker = true) as
select
  b.*,
  case
    -- Terminal states: user-set, never recomputed.
    when b.status in ('Billed', 'Cancelled') then b.status
    else (
      -- ponytail: correlated subquery, one nested loop per booking row. Fine on
      -- duties_booking_idx at this size; if the bookings list ever gets slow,
      -- rewrite as a lateral join aggregating all bookings in one pass.
      select case
        -- No live duties to infer from — keep what's stored.
        when count(*) = 0 then b.status
        when count(*) filter (where ds.effective_status not in ('Completed', 'Billed')) = 0
          then 'Completed'
        when count(*) filter (where ds.vehicle_id is not null) > 0
         and (now() at time zone 'Asia/Kolkata')
               between min(ds.start_date + coalesce(ds.reporting_time, '00:00'::time))
                   and max(ds.end_date + '23:59:59'::time)
          then 'On-Going'
        when count(*) filter (where ds.vehicle_id is not null) = count(*)
          then 'Allotted'
        when count(*) filter (where ds.vehicle_id is not null) > 0
          then 'Partially Allotted'
        -- Allotment was cleared: fall back to Confirmed.
        when b.status in ('Allotted', 'Partially Allotted')
          then 'Confirmed'
        else b.status
      end
      from public.duties_status ds
      where ds.booking_id = b.id
        and ds.effective_status <> 'Cancelled'
    )
  end as effective_status
from public.bookings b;

-- As in 026, security_invoker is load-bearing for tenant isolation.
grant select on public.bookings_status to authenticated;
