-- 929_dedupe_reissued_periods.sql
-- Runs on BOTH databases.
--
-- One duplicate, left behind by the window between the classification
-- change and the guard catching up.
--
-- ══ HOW IT GOT IN ════════════════════════════════════════════════
--
-- Booking.com re-issues a period under a fresh UID when its feed
-- regenerates. importFeed has an overlap fallback for exactly that, but
-- it keyed on `evt.status === 'blocked'` — so the moment "CLOSED - Not
-- available" started arriving as 'confirmed', re-issued periods sailed
-- past it and inserted instead of updating.
--
--     id 603   8–28 Aug   "Skhosana Thandeka"    created 19 Jul
--     id 645   9–28 Aug   "Booking.com Guest"    created  8 Aug 22:00
--
-- Same house, same platform, nineteen nights of overlap. One stay.
--
-- The guard is widened in the same commit, so this is the only one: for
-- an ambiguous Booking.com period it now matches on overlap regardless of
-- the stored status. Safe there and nowhere else — one property cannot
-- hold two overlapping Booking.com reservations, so an overlapping row on
-- the same property and platform IS this period, re-issued. Verified by
-- simulating three syncs under UIDs A, B and C: one row with the fix, two
-- by the second sync without it.
--
-- ══ WHICH ONE SURVIVES ═══════════════════════════════════════════
--
-- The one carrying a name somebody actually knows. 'Booking.com Guest' is
-- what the importer writes when the feed tells it nothing; "Skhosana
-- Thandeka" came off Booking.com's email. Keeping the informative row and
-- retiring the placeholder loses nothing.
--
-- Deactivated rather than deleted, which is what this codebase means by
-- removing something from the calendar, and is one flag to undo.

DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT drop_.id AS drop_id, drop_.guest_name AS drop_name,
           keep.id  AS keep_id,  keep.guest_name AS keep_name,
           keep.property_name, keep.check_in_date, keep.check_out_date
      FROM public.bookings keep
      JOIN public.bookings drop_
        ON drop_.property_id = keep.property_id
       AND drop_.platform    = keep.platform
       AND drop_.id <> keep.id
       AND keep.check_in_date  < drop_.check_out_date
       AND drop_.check_in_date < keep.check_out_date
     WHERE keep.is_active AND drop_.is_active
       AND keep.status  <> 'cancelled'
       AND drop_.status <> 'cancelled'
       AND keep.platform = 'booking'
       -- The loser is a name the importer invented; the winner is not.
       AND btrim(COALESCE(drop_.guest_name, '')) IN ('Booking.com Guest', 'Guest', '')
       AND btrim(COALESCE(keep.guest_name, ''))  NOT IN ('Booking.com Guest', 'Guest', '')
       AND keep.guest_name NOT LIKE '%🔒%'
       AND keep.guest_name !~* '^blocked$'
  LOOP
    UPDATE public.bookings SET is_active = false, updated_at = now() WHERE id = r.drop_id;
    RAISE NOTICE 'Retired duplicate % (%) in favour of % (%) — % % .. %',
      r.drop_id, r.drop_name, r.keep_id, r.keep_name,
      r.property_name, r.check_in_date, r.check_out_date;
    n := n + 1;
  END LOOP;

  IF n = 0 THEN RAISE NOTICE 'No re-issued duplicates found.'; END IF;
END $$;

-- End 929_dedupe_reissued_periods.
