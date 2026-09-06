-- 036 — 'Needs closing' as a first-class derived status
--
-- 026 derived Completed from the calendar alone: allotted, end_date passed.
-- That collides with `closed_at`, the only column that says the odometer pair
-- and the real timestamps were ever recorded. A back-dated allotment therefore
-- read Completed while carrying an empty slip — the rows most in need of
-- attention were the ones that looked finished. FR-54 forbids exactly that.
--
-- Split the two meanings. Completed now means closed. The calendar-only case
-- says what the operator has to do next: Needs closing.
--
-- The wrap in duties_status is the predicate AllDutiesPage's "Needs closing"
-- tab already ran client-side (effective_status = 'Completed' AND closed_at IS
-- NULL), moved into SQL. It sits *outside* the CASE on purpose: it must also
-- catch rows whose stored status is 'Completed' with no closed_at — what the
-- old syncCompletedDuties write-back left behind — and those hit the terminal
-- branch before any date arithmetic runs.
--
-- bookings_status follows, or a booking would read Completed (and offer
-- Generate Invoice) while one of its duties has nothing to bill from.
--
-- Still additive: nothing ever *writes* 'Needs closing', and duties.status /
-- bookings.status are untouched. Reverting is re-running 026 and 027.
--
-- Dropped and recreated rather than CREATE OR REPLACE: replace refuses any
-- change to a column's type, and effective_status' type is whatever the CASE
-- resolved to in 026. Dropping sidesteps the question. bookings_status depends
-- on duties_status, so it goes first and comes back last.

drop view if exists public.bookings_status;
drop view if exists public.duties_status;

-- ── duties ───────────────────────────────────────────────────────────────────
-- ponytail: business timezone is still hardcoded to IST, as in 026. Same knob:
-- lift it to a companies.timezone column and join it here.

create view public.duties_status
with (security_invoker = true) as
select
  d.*,
  case
    when s.st = 'Completed' and d.closed_at is null then 'Needs closing'
    else s.st
  end as effective_status
from public.duties d
cross join lateral (
  select case
    -- Terminal states: user-set, never recomputed.
    when d.status in ('Completed', 'Cancelled', 'Billed') then d.status

    -- The window has closed. Whether that means Completed or Needs closing is
    -- decided by closed_at, above.
    when d.vehicle_id is not null
     and d.end_date < (now() at time zone 'Asia/Kolkata')::date
      then 'Completed'

    -- On-Going: allotted and inside the window.
    when d.vehicle_id is not null
     and (now() at time zone 'Asia/Kolkata')
           between (d.start_date + coalesce(d.reporting_time, '00:00'::time))
               and (d.end_date + '23:59:59'::time)
      then 'On-Going'

    when d.vehicle_id is not null then 'Allotted'

    -- No vehicle: keep whatever was stored (Booked / Confirmed).
    else d.status
  end
) as s(st);

-- security_invoker is load-bearing: without it the view runs as its owner and
-- bypasses the duties RLS policy, leaking every company's duties.
grant select on public.duties_status to authenticated;

-- ── bookings ─────────────────────────────────────────────────────────────────

create view public.bookings_status
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

        -- Every duty has run. It is only Completed once every one of them was
        -- actually closed: Generate Invoice hangs off this status, and an
        -- unclosed duty prices to null (dutyPrice.ts) or, for Airport, bills a
        -- full fixed charge off no readings at all.
        when count(*) filter (
               where ds.effective_status not in ('Completed', 'Billed', 'Needs closing')
             ) = 0
          then case
                 when count(*) filter (where ds.effective_status = 'Needs closing') > 0
                   then 'Needs closing'
                 else 'Completed'
               end

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

grant select on public.bookings_status to authenticated;
