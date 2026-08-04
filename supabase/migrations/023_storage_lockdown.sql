-- ═══════════════════════════════════════════════════════════════════════════
-- 023 — Storage lockdown
--
-- Before this migration the `vehicle-documents` bucket was PUBLIC and carried
-- four "ALLOW ALL" policies granting anon SELECT, INSERT, UPDATE and DELETE.
-- Anyone holding the publishable key — which ships in the JS bundle — could
-- read, overwrite or delete every uploaded document.
--
-- Ten upload paths write into this one bucket, including drivers/ (licence,
-- Aadhaar, PAN attachments), customers/ and signatures/. Nothing real has been
-- uploaded yet: 7 objects, all test PDFs, and zero database rows reference any
-- of them. Fixing it now costs nothing; fixing it later means migrating live
-- PII out of a public bucket.
--
-- New convention: every object is stored under its company's id.
--
--     {company_id}/{category}/{timestamp}-{filename}
--
-- Access is granted by membership of that leading folder.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Private bucket ──────────────────────────────────────────────────────
-- Reads now require a signed URL. getPublicUrl() stops working by design.

update storage.buckets set public = false where id = 'vehicle-documents';

-- ── 2. Remove the open policies ────────────────────────────────────────────

drop policy if exists "ALLOW ALL 1e7eh5j_0" on storage.objects;
drop policy if exists "ALLOW ALL 1e7eh5j_1" on storage.objects;
drop policy if exists "ALLOW ALL 1e7eh5j_2" on storage.objects;
drop policy if exists "ALLOW ALL 1e7eh5j_3" on storage.objects;

-- ── 3. Orphaned test objects ───────────────────────────────────────────────
-- 7 test PDFs sit at un-prefixed paths. Nothing references them and they are
-- unreachable under the policies below. They cannot be removed here — Postgres
-- blocks direct DELETE on storage.objects (storage.protect_delete) to avoid
-- orphaning the underlying files — so they are removed via the Storage API as
-- a separate step. See the note at the end of this file.

-- ── 4. Company-scoped policies ─────────────────────────────────────────────
-- The leading path segment must be a company the caller belongs to. anon gets
-- nothing at all.

drop policy if exists "docs read"   on storage.objects;
drop policy if exists "docs insert" on storage.objects;
drop policy if exists "docs update" on storage.objects;
drop policy if exists "docs delete" on storage.objects;

-- Read: any company you are a member of.
create policy "docs read" on storage.objects for select to authenticated
using (
  bucket_id = 'vehicle-documents'
  and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and ((storage.foldername(name))[1])::bigint in (select public.my_company_ids())
);

-- Write: the ACTIVE company only, matching how every other insert is scoped.
-- current_company_id() re-verifies membership, so a stale or hand-set
-- active_company_id grants nothing here either.
create policy "docs insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'vehicle-documents'
  and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and ((storage.foldername(name))[1])::bigint = public.current_company_id()
);

create policy "docs update" on storage.objects for update to authenticated
using (
  bucket_id = 'vehicle-documents'
  and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and ((storage.foldername(name))[1])::bigint in (select public.my_company_ids())
);

create policy "docs delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'vehicle-documents'
  and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and ((storage.foldername(name))[1])::bigint in (select public.my_company_ids())
);

-- ── Verify ─────────────────────────────────────────────────────────────────
--   select id, public from storage.buckets;                     -- public = false
--   select policyname, roles from pg_policies                    -- no anon,
--    where schemaname = 'storage';                               -- no ALLOW ALL
--   select count(*) from storage.objects;                        -- 0
