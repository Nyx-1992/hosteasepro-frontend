-- 927_closure_runs.sql
-- Runs on BOTH databases.
--
-- Correcting the REASONING in 926, and the one row it got wrong because of
-- it.
--
-- ══ THE PREMISE THAT WAS FALSE ═══════════════════════════════════
--
-- 926 re-blocked three rows on the grounds that a guest name of 'Blocked'
-- meant "a human said this is a closure". That is not where the name comes
-- from. Rows 565, 604 and 606 are Airbnb rows also named 'Blocked', with
-- raw_summary "Airbnb (Not available)" — the importer wrote them. 'Blocked'
-- is a machine's word, not a decision, and treating it as evidence was
-- reasoning from something I had not checked.
--
-- The two long rows were right anyway, for the other reason 926 gave: 88
-- and 183 nights are not stays. The short one was not:
--
--     id 570   4–6 Nov 2026   2 nights   "CLOSED - Not available"
--
-- and it then oscillated. The repair blocked it; the next sync guessed
-- 'confirmed' from an ambiguous feed and flipped it back; every run.
-- Visible in the data as four rows all rewritten at 17:00:07 by the cron.
-- The same disagreement as the original Tiago bug — something that knows
-- nothing overruling something that knows more — in a new place.
--
-- The importer fix is the real one: Booking.com's "CLOSED - Not available"
-- now proposes a status for a row that does not exist yet and says nothing
-- about a row that already has one. An empty opinion should not overwrite
-- a decision.
--
-- ══ AND THE EVIDENCE THAT WAS THERE ALL ALONG ════════════════════
--
-- TV House, read in order rather than one row at a time:
--
--     id 570   4 Nov → 6 Nov     booking, ambiguous
--     id 565   6 Nov → 1 Dec     airbnb, "Airbnb (Not available)" — certain
--     id 513   1 Dec → 27 Feb    booking, 88 nights — certain
--
-- One continuous closure from 4 November to 27 February, split across two
-- platforms' feeds. 570 is its first segment, not a two-night guest. That
-- is a reason; the name never was.
--
-- ══ THE RULE ═════════════════════════════════════════════════════
--
-- An ambiguous Booking.com period that begins where a known closure ends,
-- or ends where one begins, belongs to that closure. Houses are shut for
-- a season, and the season does not care which calendar exports which
-- piece of it.
--
-- Deliberately narrow: it only ever touches rows the feed itself cannot
-- classify, and only when a CERTAIN block is adjacent. A real booking
-- that happens to butt up against a closure is possible — somebody
-- checking out the day the house shuts — so this is capped at 31 nights
-- like the rest, and anything longer was already handled.

DO $$
DECLARE n int;
BEGIN
  UPDATE public.bookings b
     SET status = 'blocked', updated_at = now()
   WHERE b.is_active
     AND b.status = 'confirmed'
     AND b.platform = 'booking'
     AND COALESCE(b.raw_summary, '') ILIKE '%closed%'   -- ambiguous by nature
     AND (b.check_out_date - b.check_in_date) <= 31     -- longer ones already blocked
     AND EXISTS (
       SELECT 1 FROM public.bookings o
        WHERE o.property_id = b.property_id
          AND o.id <> b.id
          AND o.is_active
          AND o.status = 'blocked'
          AND (o.check_in_date = b.check_out_date OR o.check_out_date = b.check_in_date)
     );
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Folded % ambiguous period(s) into an adjacent closure.', n;
END $$;

-- End 927_closure_runs.
