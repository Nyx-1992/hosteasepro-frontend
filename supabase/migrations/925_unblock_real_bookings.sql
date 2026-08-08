-- 925_unblock_real_bookings.sql
-- Runs on BOTH databases.
--
-- Nina: "Still missing Tiago booking 😢" — 18:56, on the day he arrived.
--
-- ══ WHAT WAS HAPPENING ═══════════════════════════════════════════
--
-- Tiago Borralho, Speranta Flat, 8–12 August, checking IN the same day
-- Lize-Mari checked out: exactly the turnover Nina needed a cleaner for.
-- The booking was in the database the whole time, with his real name on
-- it, and status 'blocked'. His row was last rewritten at 18:30. She
-- messaged at 18:56.
--
-- Two rules in api/_lib/icalImport.js contradicted each other:
--
--   the name rule    "NEVER overwrite a real name a human typed"
--   the status rule  protected 'checked-out', 'checked-in' and 'owner'
--                    — but not 'confirmed'
--
-- Booking.com's iCal export describes a genuine reservation as
-- "CLOSED - Not available" with an empty description. So every sync
-- classified it as a block. Nicole, who gets Booking.com's emails and
-- knows who is arriving, would type the guest's name in. The next sync
-- kept her name — and set the status back to 'blocked'. Fifteen minutes
-- later it did it again.
--
-- The row ended up believing both rules at once: a guest name only a
-- human could have known, and a status saying nobody was coming. Nina
-- filters on status, so she saw nothing.
--
-- ══ THE FEEDS, AS THEY ACTUALLY ARE ══════════════════════════════
--
-- Read out of raw_summary and raw_description on production rather than
-- assumed:
--
--   Airbnb reservation   "Reserved"                DESCRIPTION has
--                                                  "Reservation URL: …/HM…"
--   Airbnb block         "Airbnb (Not available)"  DESCRIPTION empty
--   Booking.com, BOTH    "CLOSED - Not available"  DESCRIPTION empty
--
-- Airbnb separates them perfectly and the importer read it inside out:
-- `airbnb && includes('reserved')` marked every real reservation as a
-- block, while actual Airbnb blocks say "Not available" and were already
-- caught by the line above. That rule could only ever be wrong.
--
-- Booking.com genuinely cannot be separated — 15 rows here, reservations
-- and closures, byte-identical. That one is a judgement call, and the
-- importer now errs towards "a guest is coming": of the 19 Booking.com
-- rows filed as blocks, 12 already carried a real name Nicole had typed.
-- Showing one line too many costs a glance; hiding an arrival costs a
-- dirty flat on the day.
--
-- ══ WHAT THIS MIGRATION DOES ═════════════════════════════════════
--
-- The code fix is self-healing — once deployed, a Booking.com "CLOSED"
-- event imports as 'confirmed' and the next sync lifts these rows on its
-- own. This runs the repair immediately instead of waiting for a cron,
-- because a guest was arriving that afternoon.
--
-- Idempotent, and deliberately narrow.

DO $$
DECLARE n_named int; n_bdc int; n_left int;
BEGIN
  -- ── 1. DEMOTED BY THE BUG ───────────────────────────────────────
  --
  -- A real guest name on a row the feed called a block. Nothing in the
  -- importer can invent a name like that — it writes '🔒 Blocked',
  -- 'Guest' or 'Booking.com Guest' — so a name that is none of those came
  -- from a person, and a person beats a calendar feed that cannot name
  -- anybody.
  --
  -- Only current and future stays. Past ones are real too, but they feed
  -- revenue reports that may already have been reconciled against
  -- platform statements, and quietly rewriting last quarter is a
  -- different decision from unblocking tomorrow. Those are listed at the
  -- end for a human to choose.
  UPDATE public.bookings SET status = 'confirmed', updated_at = now()
   WHERE is_active
     AND status = 'blocked'
     AND COALESCE(is_owner_block, false) = false
     AND check_out_date >= current_date
     AND btrim(COALESCE(guest_name, '')) <> ''
     AND btrim(guest_name) NOT IN ('Guest', 'Booking.com Guest')
     AND guest_name NOT LIKE '%🔒%'
     AND guest_name !~* '^LS-[A-Z0-9]+$'
     AND guest_name !~* '^blocked$';
  GET DIAGNOSTICS n_named = ROW_COUNT;

  -- ── 2. BOOKING.COM'S AMBIGUOUS "CLOSED" ─────────────────────────
  --
  -- No name yet, so this is the judgement call rather than a proof. Given
  -- a name to hold, it becomes a line Nina can act on and Nicole can
  -- correct; left as a block it is invisible to both.
  UPDATE public.bookings
     SET status = 'confirmed',
         guest_name = CASE WHEN btrim(COALESCE(guest_name,'')) = ''
                             OR guest_name LIKE '%🔒%'
                           THEN 'Booking.com Guest' ELSE guest_name END,
         updated_at = now()
   WHERE is_active
     AND status = 'blocked'
     AND COALESCE(is_owner_block, false) = false
     AND platform = 'booking'
     AND COALESCE(raw_summary, '') ILIKE '%closed%'
     AND check_out_date >= current_date;
  GET DIAGNOSTICS n_bdc = ROW_COUNT;

  -- ── 3. WHAT IS DELIBERATELY LEFT ALONE ──────────────────────────
  --
  -- Genuine blocks: an empty summary, a dash, or Airbnb's "Not
  -- available". Those really are closures and must stay closed, or a
  -- cleaner gets sent to an empty flat.
  SELECT count(*) INTO n_left
    FROM public.bookings
   WHERE is_active AND status = 'blocked' AND check_out_date >= current_date;

  RAISE NOTICE 'Unblocked % with a human name, % Booking.com CLOSED; % genuine blocks left.',
    n_named, n_bdc, n_left;
END $$;

-- The past ones are not touched, but they should not be forgotten either:
-- these are real stays currently counted as closures, which understates
-- occupancy and revenue. Left for a human to decide, because reconciling
-- them may double-count against statements already imported.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.bookings
   WHERE is_active AND status = 'blocked' AND check_out_date < current_date
     AND btrim(COALESCE(guest_name,'')) <> ''
     AND btrim(guest_name) NOT IN ('Guest','Booking.com Guest')
     AND guest_name NOT LIKE '%🔒%'
     AND guest_name !~* '^LS-[A-Z0-9]+$';
  IF n > 0 THEN
    RAISE NOTICE 'ALSO: % PAST bookings carry a real guest name but are filed as blocks. Real stays, counted as closures. Not touched here.', n;
  END IF;
END $$;

-- End 925_unblock_real_bookings.
