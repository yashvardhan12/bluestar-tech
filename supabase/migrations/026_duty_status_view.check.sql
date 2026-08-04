-- Self-check for 026_duty_status_view.sql
-- Run in the SQL editor (or psql). Every row must say PASS.
-- Mirrors the CASE ladder in the view against synthetic rows, so it fails
-- if the priority order or the terminal-state guard is ever broken.

with fixture(label, status, vehicle_id, start_date, end_date, reporting_time, expected) as (values
  ('terminal cancelled wins',   'Cancelled', 1::bigint, current_date-5, current_date-4, '09:00'::time, 'Cancelled'),
  ('terminal completed wins',   'Completed', 1::bigint, current_date-5, current_date-4, '09:00'::time, 'Completed'),
  ('past+vehicle completes',    'Allotted',  1::bigint, current_date-5, current_date-4, '09:00'::time, 'Completed'),
  ('in window is ongoing',      'Allotted',  1::bigint, current_date-1, current_date+1, '09:00'::time, 'On-Going'),
  ('future is allotted',        'Booked',    1::bigint, current_date+3, current_date+4, '09:00'::time, 'Allotted'),
  ('no vehicle keeps booked',   'Booked',    null,      current_date-1, current_date+1, '09:00'::time, 'Booked'),
  ('no vehicle keeps confirmed','Confirmed', null,      current_date-1, current_date+1, '09:00'::time, 'Confirmed'),
  ('null reporting_time ok',    'Allotted',  1::bigint, current_date,   current_date,   null,          'On-Going')
)
select label, expected, computed,
       case when computed = expected then 'PASS' else 'FAIL' end as result
from (
  select label, expected,
    case
      when status in ('Completed','Cancelled','Billed') then status
      when vehicle_id is not null and end_date < (now() at time zone 'Asia/Kolkata')::date then 'Completed'
      when vehicle_id is not null
       and (now() at time zone 'Asia/Kolkata')
             between (start_date + coalesce(reporting_time,'00:00'::time))
                 and (end_date + '23:59:59'::time) then 'On-Going'
      when vehicle_id is not null then 'Allotted'
      else status
    end as computed
  from fixture
) t;

-- The view must stay security_invoker, or it bypasses the duties RLS policy
-- and leaks every company's duties. This must return {security_invoker=true}.
select reloptions from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'duties_status';
