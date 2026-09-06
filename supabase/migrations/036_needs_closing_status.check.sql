-- Self-check for 036_needs_closing_status.sql
-- Run in the SQL editor (or psql). Every row must say PASS.
-- Mirrors both views against synthetic rows: the duty wrap, and the booking
-- rollup branch that decides whether Generate Invoice is offered.

-- ── duties: closed_at is what separates Completed from Needs closing ─────────
with fixture(label, status, vehicle_id, start_date, end_date, reporting_time, closed_at, expected) as (values
  ('past+vehicle, never closed', 'Allotted',  1::bigint, current_date-5, current_date-4, '09:00'::time, null,                    'Needs closing'),
  ('past+vehicle, closed',       'Allotted',  1::bigint, current_date-5, current_date-4, '09:00'::time, now()-interval '4 days', 'Completed'),
  -- The legacy rows syncCompletedDuties left behind. They hit the terminal
  -- branch, which is why the wrap sits outside the CASE and not inside it.
  ('stored Completed, no slip',  'Completed', 1::bigint, current_date-5, current_date-4, '09:00'::time, null,                    'Needs closing'),
  ('stored Completed, closed',   'Completed', 1::bigint, current_date-5, current_date-4, '09:00'::time, now()-interval '4 days', 'Completed'),
  -- Terminal states are never reinterpreted, closed or not.
  ('billed stays billed',        'Billed',    1::bigint, current_date-5, current_date-4, '09:00'::time, null,                    'Billed'),
  ('cancelled stays cancelled',  'Cancelled', 1::bigint, current_date-5, current_date-4, '09:00'::time, null,                    'Cancelled'),
  -- Still running is not overdue. An unclosed On-Going must not be swept up.
  ('in window is ongoing',       'Allotted',  1::bigint, current_date-1, current_date+1, '09:00'::time, null,                    'On-Going'),
  ('future is allotted',         'Booked',    1::bigint, current_date+3, current_date+4, '09:00'::time, null,                    'Allotted'),
  ('no vehicle keeps booked',    'Booked',    null,      current_date-5, current_date-4, '09:00'::time, null,                    'Booked')
)
select label, expected, computed,
       case when computed = expected then 'PASS' else 'FAIL' end as result
from (
  select label, expected,
    case when st = 'Completed' and closed_at is null then 'Needs closing' else st end as computed
  from (
    select label, expected, closed_at,
      case
        when status in ('Completed','Cancelled','Billed') then status
        when vehicle_id is not null and end_date < (now() at time zone 'Asia/Kolkata')::date then 'Completed'
        when vehicle_id is not null
         and (now() at time zone 'Asia/Kolkata')
               between (start_date + coalesce(reporting_time,'00:00'::time))
                   and (end_date + '23:59:59'::time) then 'On-Going'
        when vehicle_id is not null then 'Allotted'
        else status
      end as st
    from fixture
  ) inner_t
) t;

-- ── bookings: one unclosed duty holds the whole booking back ────────────────
with b(label, duties, expected) as (values
  ('all closed',            array['Completed','Completed'],      'Completed'),
  ('one never closed',      array['Completed','Needs closing'],  'Needs closing'),
  ('none closed',           array['Needs closing'],              'Needs closing'),
  ('billed duty counts',    array['Billed','Completed'],         'Completed'),
  -- Not every duty has run yet, so the branch must not fire at all.
  ('one still to run',      array['Completed','Allotted'],       'not-all-done')
)
select label, expected, computed,
       case when computed = expected then 'PASS' else 'FAIL' end as result
from (
  select label, expected,
    case
      when (select count(*) from unnest(duties) d
            where d not in ('Completed','Billed','Needs closing')) = 0
        then case when (select count(*) from unnest(duties) d where d = 'Needs closing') > 0
                  then 'Needs closing' else 'Completed' end
      else 'not-all-done'
    end as computed
  from b
) t;

-- Both views must stay security_invoker, or they bypass RLS and leak every
-- company's rows. Two rows, both {security_invoker=true}.
select c.relname, c.reloptions from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('duties_status','bookings_status');
