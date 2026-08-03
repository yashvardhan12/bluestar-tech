-- ═══════════════════════════════════════════════════════════════════════════
-- 022 — Company switcher counts
--
-- EXPERIENCE.md Rule 6. This is the ONLY query in the app that reaches across
-- companies, because the switcher must answer "how many duties in each of my
-- companies" — a question no active-company-scoped query can answer.
--
-- Exempt from ACTIVE-COMPANY scoping. NOT exempt from TENANT scoping.
-- The membership predicate lives inside the function; callers must never
-- filter client-side. It must never return the name, count, or existence of a
-- company the caller does not belong to — Owners included.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.my_companies()
returns table (
  id          bigint,
  name        text,
  short_code  text,
  duty_count  bigint,
  is_active   boolean
)
language sql stable security definer set search_path = public
as $$
  select
    c.id,
    c.name,
    c.short_code,
    (
      -- duties inherit their company through the parent booking
      select count(*)
        from public.duties d
        join public.bookings b on b.id = d.booking_id
       where b.company_id = c.id
    ) as duty_count,
    (c.id = (select p.active_company_id from public.profiles p where p.id = auth.uid())) as is_active
  from public.companies c
  join public.company_members cm
    on cm.company_id = c.id
   and cm.profile_id = auth.uid()          -- ← the tenant predicate, inside
  order by c.name;
$$;

revoke all on function public.my_companies() from public, anon;
grant execute on function public.my_companies() to authenticated;

-- Switching. Validates membership server-side rather than trusting the client,
-- so this cannot be used to point active_company_id at a company you are not
-- in. Rule 7a would fail closed anyway, but failing loudly here is kinder.
create or replace function public.set_active_company(target bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_member_of(target) then
    raise exception 'You are not a member of that company';
  end if;
  update public.profiles set active_company_id = target where id = auth.uid();
end $$;

revoke all on function public.set_active_company(bigint) from public, anon;
grant execute on function public.set_active_company(bigint) to authenticated;
