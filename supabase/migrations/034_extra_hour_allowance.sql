-- 034 — Monthly extra hours, billed per day past 12.
--
-- Rides the existing allowance path (quantity computed once per duty, priced
-- twice, snapshotted into duty_allowances) with one deliberate difference: the
-- customer rate is NOT set per duty type in duty_type_allowances. It lives on
-- duty_types.extra_hour_rate (migration 033), because the charge is native to
-- the Monthly package rather than an allowance an operator opts into.
--
-- dutyAllowances.ts injects that rate into the customerRates map, so nothing
-- else in the engine has to know the difference.
--
-- One row per company, matching how 028 seeded the other nine. driver_rate
-- stays null: this bills the customer and pays the driver nothing until an
-- operator sets a rate on the Allowances page.
insert into public.allowances (company_id, code, name, unit)
select id, 'extra_hour', 'Extra hours', 'hour'
from public.companies
on conflict (company_id, code) do nothing;
