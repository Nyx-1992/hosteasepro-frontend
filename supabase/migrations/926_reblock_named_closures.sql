-- 926_reblock_named_closures.sql
-- Runs on BOTH databases.
--
-- Correcting 925, which went one step too far.
--
-- ══ WHAT I GOT WRONG ═════════════════════════════════════════════
--
-- 925 lifted Booking.com "CLOSED - Not available" rows out of 'blocked',
-- on the evidence that their feed says exactly that for real reservations.
-- Its first rule was careful to skip anything a human had named 'Blocked'.
-- Its second rule — the Booking.com one — was not, and flipped three rows
-- on TV House that a person had deliberately called "Blocked":
--
--     id 570    4–6 Nov 2026          2 nights
--     id 513    1 Dec 2026–27 Feb     88 nights
--     id 608    9 Aug 2027–8 Feb      183 nights
--
-- An 88-night guest stay is not a guest stay. Somebody closed the house
-- for the season and wrote it down, and I overruled them — which is
-- precisely the fault 925 existed to fix, committed in the other
-- direction. Found by checking whether the repair had created overlapping
-- bookings, not by reading the migration back.
--
-- ══ THE RULE THAT WAS MISSING ════════════════════════════════════
--
-- A name is a decision. '🔒 Blocked' and 'Blocked' both mean somebody
-- said this is a closure, and neither is a guest.
--
-- Length is the second signal, and it has evidence behind it rather than
-- being a round number: the longest genuine reservation in this data is
-- Skhosana Thandeka at 20 nights, while the closures are 88 and 183. A
-- Booking.com "CLOSED" run beyond a month is a closed house, not a
-- booking, so the importer now treats it as one.

DO $$
DECLARE n int;
BEGIN
  UPDATE public.bookings
     SET status = 'blocked', updated_at = now()
   WHERE is_active
     AND status = 'confirmed'
     AND platform = 'booking'
     AND COALESCE(raw_summary, '') ILIKE '%closed%'
     AND (
       -- A human called it a block.
       guest_name ~* '^\s*(🔒\s*)?blocked\s*$'
       -- Or nothing did, and it is far too long to be a stay.
       OR (btrim(COALESCE(guest_name, '')) IN ('', 'Booking.com Guest')
           AND (check_out_date - check_in_date) > 31)
     );
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Re-blocked % row(s) that 925 should not have lifted.', n;
END $$;

-- End 926_reblock_named_closures.
