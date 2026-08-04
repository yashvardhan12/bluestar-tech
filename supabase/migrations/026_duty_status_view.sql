-- 026 — Duty status as a derived view
--
-- Replaces the client-side write-back that ran on every page load
-- (syncCompletedDuties / syncDutiesOnGoing / syncBookingStatus fan-out).
-- Those cost ~12 round trips before the duties table settled and wrote
-- to the DB on a *read* path.
--
-- Duty status is a pure function of (vehicle_id, start_date, reporting_time,
-- end_date, now()) except for the terminal states, which a human sets and
-- automation must never override.
--
-- This is additive: `duties.status` is untouched and still written by the
-- allot / clear / cancel actions. Reverting is `drop view public.duties_status`.
--
-- ponytail: a GENERATED column can't work here — Postgres requires the
-- expression to be IMMUTABLE and this depends on now(). A view is the only
-- native option that keeps the value filterable in SQL.

-- ponytail: business timezone is hardcoded to IST, the one the fleet runs on.
-- It was previously the *browser's* local zone, which meant status flipped at
-- different moments for a user travelling. If you ever operate outside India,
-- this is the knob — lift it to a companies.timezone column and join it here.

create or replace view public.duties_status
with (security_invoker = true) as
select
  d.*,
  case
    -- Terminal states: user-set, never recomputed.
    when d.status in ('Completed', 'Cancelled', 'Billed') then d.status

    -- Auto-complete: allotted and the window has closed.
    -- NOTE: the old client code required status to already be 'On-Going'
    -- before completing, so a duty nobody had a tab open for during its
    -- window would never complete. This completes it regardless.
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
  end as effective_status
from public.duties d;

-- security_invoker above is load-bearing: without it the view would run as its
-- owner and bypass the duties RLS policy, leaking every company's duties.
grant select on public.duties_status to authenticated;
