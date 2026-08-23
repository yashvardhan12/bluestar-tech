-- 029_allowance_scope_tighten.sql
-- 028 scoped both junction tables through their parent only, which left
-- allowance_id free: a company-1 duty type could reference a company-2
-- allowance. Verified reproducible before this fix.
--
-- Tightened on WITH CHECK (writes) but deliberately NOT on USING (reads).
-- Narrowing USING would mean an allowance that ever became invisible would
-- also hide the duty_allowances rows recording what was already billed, and
-- hiding money is worse than the hole being closed here.

drop policy "scoped via duty type" on public.duty_type_allowances;
create policy "scoped via duty type" on public.duty_type_allowances
  for all
  using (duty_type_id in (select id from public.duty_types))
  with check (
    duty_type_id in (select id from public.duty_types)
    and allowance_id in (select id from public.allowances)
  );

drop policy "scoped via duty" on public.duty_allowances;
create policy "scoped via duty" on public.duty_allowances
  for all
  using (duty_id in (select id from public.duties))
  with check (
    duty_id in (select id from public.duties)
    and allowance_id in (select id from public.allowances)
  );
