-- ═══════════════════════════════════════════════════════════════════════════
-- 021 — Bootstrap the first Owner
--
-- Run AFTER 019 and 020. Creates one login, makes it the sole Owner, and
-- puts it in the seed company so the app has a valid active company.
--
-- No Admins are created. Every future member is invited from Settings and
-- lands as an Admin via handle_new_user().
--
--   email     owner@bluestar.co.in
--   password  Bluestar@2026
--
-- CHANGE THE PASSWORD AFTER FIRST LOGIN. It is in git.
--
-- ── Prefer the Dashboard if this errors ────────────────────────────────────
-- Seeding auth.users by hand is version-sensitive. If anything below fails,
-- delete nothing — just create the user via
--   Dashboard -> Authentication -> Users -> Add user
--   (tick "Auto Confirm User")
-- and then run PART 2 alone, which is the part that actually matters.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PART 1 — create the login ──────────────────────────────────────────────
-- Skips silently if the email already exists, so this is safe to re-run and
-- safe to skip entirely if you used the Dashboard.

do $$
declare
  uid uuid := gen_random_uuid();
begin
  if exists (select 1 from auth.users where email = 'owner@bluestar.co.in') then
    raise notice 'owner@bluestar.co.in already exists — skipping creation';
    return;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    uid, 'authenticated', 'authenticated',
    'owner@bluestar.co.in',
    extensions.crypt('Bluestar@2026', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '', '', '', ''
  );

  -- Required for email/password sign-in on current GoTrue versions.
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email', 'owner@bluestar.co.in'),
    'email', now(), now(), now()
  );

  raise notice 'created owner@bluestar.co.in';
end $$;

-- ── PART 2 — make it the Owner, and give it a company ──────────────────────
-- This is the part that matters. Safe to re-run.
-- Works whether the user came from PART 1 or from the Dashboard.

-- handle_new_user() created the profile as 'Admin'. Promote it.
-- The guard trigger allows this because auth.uid() is null in the SQL editor.
update public.profiles
   set role       = 'Owner',
       first_name = coalesce(nullif(first_name, ''), 'Yash'),
       email      = 'owner@bluestar.co.in'
 where id = (select id from auth.users where email = 'owner@bluestar.co.in');

-- Membership. Without this current_company_id() returns null (Rule 7a) and
-- every operational table returns zero rows — the app would look broken.
insert into public.company_members (company_id, profile_id)
select c.id, p.id
  from public.companies c
 cross join public.profiles p
 where p.role = 'Owner'
   and c.id = (select min(id) from public.companies)
on conflict do nothing;

-- Active company, so the app has somewhere to land.
update public.profiles
   set active_company_id = (select min(id) from public.companies)
 where role = 'Owner'
   and active_company_id is null;

-- ── Verify ─────────────────────────────────────────────────────────────────
select
  u.email,
  p.role,
  c.name  as active_company,
  c.short_code,
  (select count(*) from public.company_members m where m.profile_id = p.id) as memberships
from auth.users u
join public.profiles p  on p.id = u.id
left join public.companies c on c.id = p.active_company_id
where u.email = 'owner@bluestar.co.in';

-- Expected: one row — Owner, active company set, memberships = 1.
-- If active_company is null, the app will show no data anywhere.

-- ── NOTE: only one Owner exists ────────────────────────────────────────────
-- Only an Owner can promote an Owner, so losing this login is unrecoverable
-- through the UI (guard_last_owner also blocks demoting it). Once you invite a
-- second person, promote them too:
--
--   update public.profiles set role = 'Owner' where email = 'second@bluestar.co.in';
