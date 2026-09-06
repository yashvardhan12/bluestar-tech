-- ═══════════════════════════════════════════════════════════════════════════
-- 032 — Guards the bookings import depends on
--
-- Two pre-requisites, both live bugs independent of the importer.
--
-- 1. booking_ref_seq has never been used. set_booking_ref() only fires when the
--    client sends '', and AddBookingDrawer always sent a value it computed as
--    "newest booking_ref by created_at, strip BK-, parseInt, +1". Once the
--    importer writes Travel IDs into booking_ref, that parse reads 60082453 and
--    the next manual booking becomes BK-60082454 — permanently.
--
--    The client is being changed to send '' so the sequence takes over, but the
--    sequence still sits at 1 while BK-00002..BK-00005 exist. Left alone, the
--    second manual booking after the fix collides on bookings_booking_ref_key.
--
-- 2. duties/bookings had no check that the window runs forwards. The client
--    export we import from carries 99 rows with start and end times reversed
--    (see src/lib/importDutyTimes.ts); a date-order check is the backstop for
--    that class of bug at the boundary, not just for this importer.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Advance booking_ref_seq past every ref already issued ───────────────
-- Derived, not hardcoded, so this is correct in every environment and safe to
-- re-run. Only BK-\d+ refs count: imported refs are client Travel IDs and must
-- never drag the sequence up to 60-million.
do $$
declare
  highest bigint;
begin
  select coalesce(max(substring(booking_ref from '^BK-(\d+)$')::bigint), 0)
    into highest
    from public.bookings
   where booking_ref ~ '^BK-\d+$';

  -- is_called = true, so the next nextval() returns highest + 1.
  perform setval('public.booking_ref_seq', greatest(highest, 1), true);
end $$;

-- ── 2. A duty window must run forwards ─────────────────────────────────────
alter table public.duties   drop constraint if exists duties_dates_forward;
alter table public.duties   add  constraint duties_dates_forward
  check (end_date >= start_date);

alter table public.bookings drop constraint if exists bookings_dates_forward;
alter table public.bookings add  constraint bookings_dates_forward
  check (end_date >= start_date);
