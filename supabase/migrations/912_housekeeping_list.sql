-- 912_housekeeping_list.sql
-- Runs on BOTH databases.
--
-- Owner: "Important to note is with guesthouses, that we ask if daily
-- cleaners are on board, since this would give them a list of cleaning
-- required (which maybe can be scaled up to hotels one day)."
--
-- Two corrections to what 908 built, and both matter.
--
-- ══ 1. IT IS A QUESTION ABOUT THE BUSINESS, NOT ABOUT EACH ROOM ═══
--
-- 908 put daily_service on every property as an independent flag, so
-- setting up an eight-room guesthouse meant ticking the same box eight
-- times and remembering to tick it again on room nine. But no guesthouse
-- services room 3 daily and room 4 weekly. Either there are cleaners in
-- every morning or there are not — it is one fact about how the place is
-- run, asked once, when the building is set up.
--
-- The column stays where it is, because a room CAN legitimately differ
-- (the self-catering cottage at the bottom of the garden). What changes is
-- that setting it on the building cascades to its rooms, so the common
-- case is one tick and the exception is still possible.
--
-- ══ 2. THE POINT WAS NEVER THE FLAG. IT IS THE LIST. ══════════════
--
-- "This would give them a list of cleaning required." 908 generated
-- domestics rows, which is the right storage and the wrong deliverable. A
-- housekeeper at 8am does not want a filtered table; they want the sheet:
-- which rooms are being turned over, which are being made up, which need
-- checking before somebody arrives, in the order they will walk them.
--
-- That is what housekeeping_list() returns, and it is deliberately DERIVED
-- from bookings rather than read from domestics. A room whose guest left
-- this morning needs turning over whether or not anybody remembered to
-- generate a clean for it — and the sheet that only shows what was
-- generated is the sheet that hides the room nobody scheduled.
--
-- ══ AND YES, THIS IS THE HOTEL PATH ═══════════════════════════════
--
-- "Which maybe can be scaled up to hotels one day." It already is, in
-- shape: turn over / service / prepare, grouped by floor, is precisely a
-- hotel housekeeping sheet. What a hotel would add is room attendants with
-- assigned sections, credit-per-room workload balancing, and linen change
-- rules on a cycle. None of that is built and none of it is prevented —
-- the sheet is one function over rooms and dates, which is the same shape
-- at four rooms and at four hundred.

-- ══ THE SHEET ═════════════════════════════════════════════════════
--
-- One row per room that needs something doing. Rooms that need nothing are
-- left out entirely: a list you have to scan for blanks is a worse list.
CREATE OR REPLACE FUNCTION public.housekeeping_list(p_parent uuid, p_date date)
RETURNS TABLE (
  room_id     uuid,
  room_name   text,
  floor       text,
  sort_order  int,
  task        text,      -- turnover | service | prepare
  guest       text,      -- who is leaving, staying, or arriving
  nights      int,
  assigned_to text,      -- from domestics, '' when nobody has it yet
  done        boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH scope AS (
    SELECT p.id, p.name, p.floor, p.sort_order, p.short_key, p.daily_service
      FROM public.properties p
     WHERE p.org_id = public.current_org_id()
       AND (p.parent_id = p_parent
            OR (p.id = p_parent
                AND NOT EXISTS (SELECT 1 FROM public.properties c WHERE c.parent_id = p_parent)))
  ),
  stays AS (
    SELECT s.id AS room_id,
           bk.guest_name,
           bk.check_in_date::date  AS ci,
           bk.check_out_date::date AS co,
           bk.nights
      FROM scope s
      JOIN public.bookings bk ON bk.property_id = s.id
     WHERE bk.is_active
       AND COALESCE(bk.status,'') <> 'cancelled'
       AND COALESCE(bk.is_owner_block,false) = false
       AND bk.check_in_date::date <= p_date
       AND bk.check_out_date::date >= p_date
  ),
  work AS (
    SELECT s.id, s.name, s.floor, s.sort_order, s.short_key,
           CASE
             -- Somebody left this morning: full clean, whatever else is
             -- true. Ranked first because it is the one with a deadline —
             -- the next guest may be arriving into it this afternoon.
             WHEN EXISTS (SELECT 1 FROM stays x WHERE x.room_id = s.id AND x.co = p_date)
               THEN 'turnover'
             -- Guest in residence and this place has cleaners in daily.
             WHEN s.daily_service
              AND EXISTS (SELECT 1 FROM stays x
                           WHERE x.room_id = s.id AND x.ci < p_date AND x.co > p_date)
               THEN 'service'
             -- Empty last night, somebody arrives today: check it is ready.
             WHEN EXISTS (SELECT 1 FROM stays x WHERE x.room_id = s.id AND x.ci = p_date)
               THEN 'prepare'
             ELSE NULL
           END AS task
      FROM scope s
  )
  SELECT w.id, w.name, w.floor, w.sort_order, w.task,
         (SELECT x.guest_name FROM stays x
           WHERE x.room_id = w.id
           ORDER BY CASE WHEN x.co = p_date THEN 0 ELSE 1 END LIMIT 1),
         (SELECT x.nights FROM stays x
           WHERE x.room_id = w.id
           ORDER BY CASE WHEN x.co = p_date THEN 0 ELSE 1 END LIMIT 1),
         COALESCE((SELECT d.cleaner FROM public.domestics d
                    WHERE d.org_id = public.current_org_id()
                      AND d.property_id = w.short_key
                      AND d.date = p_date
                      AND COALESCE(d.status,'') <> 'cancelled'
                    ORDER BY d.created_at DESC LIMIT 1), ''),
         COALESCE((SELECT d.status = 'completed' FROM public.domestics d
                    WHERE d.org_id = public.current_org_id()
                      AND d.property_id = w.short_key
                      AND d.date = p_date
                      AND COALESCE(d.status,'') <> 'cancelled'
                    ORDER BY d.created_at DESC LIMIT 1), false)
    FROM work w
   WHERE w.task IS NOT NULL
   ORDER BY CASE w.task WHEN 'turnover' THEN 0 WHEN 'prepare' THEN 1 ELSE 2 END,
            w.floor NULLS FIRST, w.sort_order, w.name;
$$;

COMMENT ON FUNCTION public.housekeeping_list(uuid, date) IS
  'The morning sheet: which rooms are turned over, made up, or checked before an arrival, in the order they are walked. Derived from bookings rather than from generated cleans, so a room nobody scheduled still appears — the list that only shows what was scheduled is the list that hides the room you forgot.';

REVOKE ALL ON FUNCTION public.housekeeping_list(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.housekeeping_list(uuid, date) TO authenticated;

-- ══ ONE TICK FOR THE WHOLE BUILDING ═══════════════════════════════
--
-- Called when the building's answer changes. Kept in SQL rather than
-- looped in the browser so it is one statement and cannot half-apply
-- across eight rooms on a bad connection.
CREATE OR REPLACE FUNCTION public.set_daily_service(p_parent uuid, p_on boolean)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.properties
                  WHERE id = p_parent AND org_id = public.current_org_id()) THEN
    RAISE EXCEPTION 'Not permitted.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.properties
     SET daily_service = p_on, updated_at = now()
   WHERE org_id = public.current_org_id()
     AND (id = p_parent OR parent_id = p_parent);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

COMMENT ON FUNCTION public.set_daily_service(uuid, boolean) IS
  'Sets daily servicing on a building and all its rooms at once. No guesthouse services room 3 daily and room 4 weekly — it is one fact about how the place is run, asked once.';

REVOKE ALL ON FUNCTION public.set_daily_service(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_daily_service(uuid, boolean) TO authenticated;

-- End 912_housekeeping_list.
