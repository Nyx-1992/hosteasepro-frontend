-- 911_room_layout.sql
-- Runs on BOTH databases.
--
-- Owner: "Make it a nice user interface, I would love even a look of a
-- sketched house and one can add floors and rooms per floor, which
-- visualises the booking a bit! Besides it's chalets etc."
--
-- ══ WHY "FLOOR" IS A LABEL AND NOT A NUMBER ═══════════════════════
--
-- The obvious column is floor int — ground is 0, first is 1. It is wrong,
-- and the word "chalets" is why. A chalet park has no storeys; it has
-- clusters. A lodge has "Riverside" and "Garden". A converted farmhouse
-- has "The Barn" and "Main House". Numbering them forces a fiction, and
-- the screen then has to render "Floor 2" over a row of cabins standing on
-- grass.
--
-- So it is free text the owner writes themselves, and the UI groups by
-- whatever they typed. "Ground floor" works. So does "Garden chalets". A
-- room with no group at all just sits in the building, which is the right
-- behaviour for a four-room guesthouse where floors are not worth
-- mentioning.
--
-- ══ AND WHY sort_order EXISTS ═════════════════════════════════════
--
-- Rooms are not alphabetical. "Room 10" sorts before "Room 2", and a
-- guesthouse's own order — the one they walk in, the one on their
-- keyboard — is neither alphabetical nor numeric. One integer, dragged in
-- the UI, beats teaching a sort function about human room-numbering
-- conventions it will still get wrong.

-- ══ AND WHAT KIND OF BUILDING IT IS ═══════════════════════════════
--
-- Owner: "I am sure we can add a dropdown of guest house building types!"
--
-- Right, and it does more than label the row — it decides how the place is
-- DRAWN. Two layout families, which is the only distinction the picture
-- actually needs:
--
--   stacked    floors inside one building, under one roof
--              guesthouse, bnb, hotel, backpackers, apartment_block
--   detached   separate units standing on a plot, each with its own roof
--              chalets, cottages, lodge, farmstay, camping
--
-- Drawing a chalet park as three storeys stacked on top of each other is
-- exactly the sort of wrong that makes somebody stop trusting the screen,
-- and it is why the type has to be recorded rather than guessed from the
-- room count.
--
-- Free text with a CHECK, matching how properties.type already works.
-- Adding "backpackers" later is one migration and no data change.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS floor         text,
  ADD COLUMN IF NOT EXISTS sort_order    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS building_type text;

ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_building_type_check;
ALTER TABLE public.properties ADD CONSTRAINT properties_building_type_check
  CHECK (building_type IS NULL OR building_type = ANY (ARRAY[
    'guesthouse','bnb','hotel','backpackers','apartment_block',
    'chalets','cottages','lodge','farmstay','camping'
  ]));

COMMENT ON COLUMN public.properties.building_type IS
  'What kind of place this is, which decides how it is drawn: guesthouse/bnb/hotel/backpackers/apartment_block stack their rooms as floors under one roof; chalets/cottages/lodge/farmstay/camping stand as separate units on a plot. NULL on anything that is not a multi-room building.';

COMMENT ON COLUMN public.properties.floor IS
  'Free-text group a room sits in: "Ground floor", "Garden chalets", "The Barn". Deliberately not a number — a chalet park has clusters, not storeys. NULL means the room is simply in the building.';

COMMENT ON COLUMN public.properties.sort_order IS
  'Display order within its group. Rooms are not alphabetical: "Room 10" sorts before "Room 2", and a guesthouse walks its rooms in an order that is neither.';

CREATE INDEX IF NOT EXISTS properties_layout_idx
  ON public.properties (parent_id, floor, sort_order);

-- ══ WHAT IS IN EACH ROOM TONIGHT ══════════════════════════════════
--
-- One call for the whole building rather than one per room, because the
-- screen draws them all at once and eight round trips to colour eight
-- tiles is how a nice idea becomes a slow one.
--
-- Returns a state per room for a single date. The states are the ones a
-- guesthouse actually acts on in the morning:
--
--   occupied   a guest is in it tonight and was last night
--   arriving   somebody checks in today
--   departing  somebody checks out today — this room needs turning over
--   free       nobody in it
--
-- 'departing' wins over 'arriving' when both fall on the same day, because
-- a same-day turnover is the thing that has to happen between them and it
-- is what the person reading the screen needs to see.
CREATE OR REPLACE FUNCTION public.rooms_on_date(p_parent uuid, p_date date)
RETURNS TABLE (
  room_id    uuid,
  room_name  text,
  floor      text,
  sort_order int,
  state      text,
  guest      text,
  nights     int,
  clean_due  boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH scope AS (
    SELECT p.id, p.name, p.floor, p.sort_order, p.short_key
      FROM public.properties p
     WHERE p.org_id = public.current_org_id()
       AND (p.parent_id = p_parent
            OR (p.id = p_parent
                AND NOT EXISTS (SELECT 1 FROM public.properties c WHERE c.parent_id = p_parent)))
  ),
  b AS (
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
       -- A stay covers the date if it starts on or before it and ends
       -- after it; check-out day is not a night slept.
       AND bk.check_in_date::date <= p_date
       AND bk.check_out_date::date >= p_date
  )
  SELECT s.id,
         s.name,
         s.floor,
         s.sort_order,
         CASE WHEN b.room_id IS NULL THEN 'free'
              WHEN b.co = p_date THEN 'departing'
              WHEN b.ci = p_date THEN 'arriving'
              ELSE 'occupied' END,
         b.guest_name,
         b.nights,
         EXISTS (SELECT 1 FROM public.domestics d
                  WHERE d.org_id = public.current_org_id()
                    AND d.property_id = s.short_key
                    AND d.date = p_date
                    AND COALESCE(d.status,'') = 'scheduled')
    FROM scope s
    LEFT JOIN LATERAL (
      -- One row per room. A same-day turnover produces two matching stays;
      -- the departing one is shown, because that is the one with work in it.
      SELECT * FROM b WHERE b.room_id = s.id
       ORDER BY CASE WHEN b.co = p_date THEN 0 ELSE 1 END
       LIMIT 1
    ) b ON true
   ORDER BY s.floor NULLS FIRST, s.sort_order, s.name;
$$;

COMMENT ON FUNCTION public.rooms_on_date(uuid, date) IS
  'Every room in a building with its state on one date: free, arriving, departing or occupied, plus whether a clean is booked. One call for the whole house — the screen draws all the tiles at once.';

REVOKE ALL ON FUNCTION public.rooms_on_date(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rooms_on_date(uuid, date) TO authenticated;

-- End 911_room_layout.
