-- 928_caretaker_off_the_calendar.sql
-- Runs on production only in practice; harmless elsewhere (matches nothing).
--
-- Owner: "TV booking's Tino caretaker is the granny flat and the caretaker
-- — this probably doesn't even have to be managed to be honest."
--
-- ══ WHAT IT WAS DOING ════════════════════════════════════════════
--
-- One manual booking, TV House, 1 Feb – 31 Dec 2026. 333 nights, status
-- 'confirmed'. It is the caretaker living in the granny flat, which is a
-- separate dwelling — so it was never a guest occupying the house, but
-- the calendar could not tell the difference.
--
-- sunsetcoaststays.co.za builds availability from bookings and treats
-- confirmed, pending, owner AND blocked all as unavailable
-- (pages/api/availability.ts). So this row made the main house look sold
-- out for eleven months.
--
--     63 nights between today and 31 December are blocked by this row
--     and by NOTHING ELSE.
--
-- Sixty-three nights that a guest could not book, on the one channel
-- where the agency keeps the whole rate instead of a platform's cut.
-- Nobody would have seen it: the site does not say why a date is taken.
--
-- ══ WHY DEACTIVATE RATHER THAN DELETE, OR MARK IT 'owner' ════════
--
-- 'owner' would not have helped — availability counts owner stays as
-- unavailable too, so the house would still read as full. Deleting throws
-- away the record of an arrangement that is real, just not a booking.
--
-- is_active = false is what the rest of this system already means by
-- "off the calendar": the row survives, the iCal importer ignores it, and
-- restoring it is one flag. Reversible on purpose, because this is the
-- owner's call and not the migration's.
--
-- IF THE GRANNY FLAT SHOULD EARN ITS OWN LINE — separate property, own
-- short_key, own rate — that is a different and larger job than this, and
-- worth doing deliberately rather than as a side effect of a bug fix.

DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT b.id, b.property_name, b.check_in_date, b.check_out_date,
           (b.check_out_date - b.check_in_date) AS nights
      FROM public.bookings b
     WHERE b.is_active
       AND b.platform = 'manual'
       AND b.guest_name ILIKE '%caretaker%'
       AND (b.check_out_date - b.check_in_date) > 180   -- a residency, not a stay
  LOOP
    UPDATE public.bookings
       SET is_active = false, updated_at = now()
     WHERE id = r.id;
    RAISE NOTICE 'Took booking % off the calendar: % %..% (% nights).',
      r.id, r.property_name, r.check_in_date, r.check_out_date, r.nights;
    n := n + 1;
  END LOOP;

  IF n = 0 THEN
    RAISE NOTICE 'No long-term caretaker booking found; nothing changed.';
  END IF;
END $$;

-- End 928_caretaker_off_the_calendar.
