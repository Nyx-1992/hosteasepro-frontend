-- 916_set_rate_seasons.sql
-- Runs on BOTH databases.
--
-- Replace a property's seasons in one statement.
--
-- ══ WHY A FUNCTION AND NOT TWO QUERIES ═══════════════════════════
--
-- Seasons have no natural key. Two can share a name, months move between
-- them, and a row's identity is not something the form can recover — so
-- saving the set means replacing it rather than diffing it.
--
-- Done from the browser that is DELETE followed by INSERT, and the gap
-- between them is the problem: a connection that drops in the middle
-- leaves the property with no seasons at all. Nothing errors afterwards,
-- nothing looks wrong on screen, and the property quietly reverts to its
-- base rate — so Christmas is priced at the winter rate and the first
-- anyone knows is a booking that came in too cheap.
--
-- Inside a function the two statements are one transaction: either the new
-- set is there or the old one still is. This is the same reasoning as
-- set_daily_service() in 912, which exists because the same half-applied
-- write across eight rooms was the same kind of unacceptable.
--
-- ══ WHOSE PROPERTY ═══════════════════════════════════════════════
--
-- SECURITY DEFINER, so it must check the org itself — RLS is not doing it
-- here. The property is looked up by id AND org, and a property belonging
-- to someone else simply is not found. It raises rather than returning 0,
-- because "saved, nothing happened" is the worst of the three outcomes.

CREATE OR REPLACE FUNCTION public.set_rate_seasons(p_property uuid, p_seasons jsonb)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid := public.current_org_id();
  v_ok  boolean;
  n     int;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT true INTO v_ok
    FROM public.properties
   WHERE id = p_property AND org_id = v_org;

  IF v_ok IS NOT TRUE THEN
    -- Deliberately the same message whether the property does not exist or
    -- belongs to another agency: the difference is not this caller's to
    -- learn, and telling them confirms an id they should not have.
    RAISE EXCEPTION 'No such property';
  END IF;

  DELETE FROM public.rate_seasons WHERE property_id = p_property;

  -- months arrives as a JSON array of 1-12. Worth being strict about:
  -- JavaScript's Date.getMonth() is 0-11, the booking site's hardcoded
  -- rates are written in that numbering, and anything that quietly accepts
  -- a 0 shifts every season by a month — Peak Summer silently becoming
  -- January to March, which prices Christmas at the shoulder rate and
  -- looks like nothing at all went wrong.
  IF p_seasons IS NOT NULL AND jsonb_array_length(p_seasons) > 0 THEN
    INSERT INTO public.rate_seasons (org_id, property_id, name, rate, months, sort)
    SELECT v_org,
           p_property,
           s->>'name',
           (s->>'rate')::numeric,
           ARRAY(SELECT (m)::int FROM jsonb_array_elements_text(s->'months') m),
           COALESCE((s->>'sort')::int, 0)
      FROM jsonb_array_elements(p_seasons) s
     WHERE s->>'name' IS NOT NULL
       AND s->>'rate' IS NOT NULL;
  END IF;

  SELECT count(*) INTO n FROM public.rate_seasons WHERE property_id = p_property;
  RETURN n;
END $$;

COMMENT ON FUNCTION public.set_rate_seasons(uuid, jsonb) IS
  'Replace a property''s seasonal rates in one transaction. Delete-then-insert from the browser can leave a property with no seasons if the connection drops between the two, which silently reverts it to the base rate.';

REVOKE ALL ON FUNCTION public.set_rate_seasons(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_rate_seasons(uuid, jsonb) TO authenticated;

-- Months must be 1-12. The constraint is the backstop for the paragraph
-- above: if anything ever does send 0-11, it fails loudly at the write
-- instead of pricing a whole year one month out.
--
-- Written with the containment operator rather than the obvious
-- NOT EXISTS (SELECT ... FROM unnest(months) ...), because a CHECK
-- constraint may not contain a subquery — Postgres rejects it outright.
-- <@ is "every element of the left array appears in the right one", which
-- is the same test without one.
-- COALESCE around array_length is not decoration. array_length on an EMPTY
-- array returns NULL rather than 0, NULL BETWEEN 1 AND 12 is NULL, and a
-- CHECK constraint passes on NULL — only FALSE fails it. Written the
-- obvious way, a season covering no months at all sails straight through,
-- which is precisely the row this constraint exists to stop: it never
-- matches any date, so it looks like a season that is simply never in use.
-- (Caught by testing the constraint rather than reading it.)
ALTER TABLE public.rate_seasons DROP CONSTRAINT IF EXISTS rate_seasons_months_valid;
ALTER TABLE public.rate_seasons ADD CONSTRAINT rate_seasons_months_valid
  CHECK (
    COALESCE(array_length(months, 1), 0) BETWEEN 1 AND 12
    AND months <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]
  );

-- End 916_set_rate_seasons.
