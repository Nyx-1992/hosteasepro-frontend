-- 924_weekend_rates.sql
-- Runs on BOTH databases.
--
-- Weekend pricing, and the rule for when a weekend is also a public
-- holiday.
--
-- Owner: "Weekend pricing - yes." And on the collision: "yes the higher of
-- the two" — 30% + 20% compounding to 56% is too much for one night.
--
-- ══ WHY THIS IS WORTH MORE THAN THE HOLIDAY PREMIUM ══════════════
--
-- There are about 104 Friday and Saturday nights in a year and 12 public
-- holidays. At the same percentage, weekends are roughly nine times the
-- money. The holiday premium shipped first because it was the question
-- being asked; this is the one that pays.
--
-- ══ HIGHER OF THE TWO, NOT BOTH ══════════════════════════════════
--
--     premium = GREATEST(weekend, holiday)
--
-- Not 1.30 × 1.20. A guest booking the Saturday of the Easter weekend
-- should see one premium, the larger one. Ties go to the holiday, because
-- "Good Friday" tells a guest more about why the price moved than
-- "Weekend" does.
--
-- ══ WHICH DAYS ARE THE WEEKEND ═══════════════════════════════════
--
-- Friday and Saturday NIGHTS — ISO day-of-week 5 and 6 — because a night
-- is named for the day you go to sleep, and stay_quote already generates
-- exactly those dates (check_in .. check_out - 1).
--
-- Stored on org_settings rather than assumed, because this is sold to
-- agencies and the weekend is not Friday-Saturday everywhere: much of the
-- Gulf runs Friday-Saturday too, but Israel is Friday-Saturday shifted,
-- and several countries take Thursday-Friday. A default that is right for
-- South Africa is fine as a default and wrong as a law.

-- ══════════════════════════════════════════════════════════════════
-- 1. THE TWO NEW SETTINGS
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS weekend_premium_pct numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.properties.weekend_premium_pct IS
  'Percent added to the nightly rate on weekend nights. 0 means no weekend pricing. When a weekend night is also a public holiday the HIGHER of this and holiday_premium_pct applies, never both.';

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS weekend_days smallint[] NOT NULL DEFAULT '{5,6}';

COMMENT ON COLUMN public.org_settings.weekend_days IS
  'Which nights count as weekend, ISO day-of-week (1=Monday .. 7=Sunday). Defaults to {5,6}, Friday and Saturday nights. An agency outside South Africa can say otherwise.';

-- An empty array would mean "no nights are weekend nights", which is what
-- weekend_premium_pct = 0 is for, and it reads as a mistake rather than a
-- choice. NULL is already impossible.
--
-- COALESCE around array_length is not decoration: array_length on an empty
-- array returns NULL, and a CHECK constraint PASSES on NULL. That exact
-- hole let an empty months array through in 916, and it was found by
-- testing the constraint rather than by reading it.
ALTER TABLE public.org_settings DROP CONSTRAINT IF EXISTS org_settings_weekend_days_valid;
ALTER TABLE public.org_settings ADD CONSTRAINT org_settings_weekend_days_valid
  CHECK (
    COALESCE(array_length(weekend_days, 1), 0) BETWEEN 1 AND 7
    AND weekend_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
  );

-- ══════════════════════════════════════════════════════════════════
-- 2. THE RATE FOR ONE NIGHT
-- ══════════════════════════════════════════════════════════════════
--
-- Two columns are added to the result, so DROP and recreate rather than
-- REPLACE — a return type cannot be changed in place.
--
--   premium_kind  'holiday' | 'weekend' | NULL — which one won, so a
--                 breakdown can say WHY a night costs more instead of
--                 showing a guest an unexplained number.
--   weekend       the plain fact, kept separate from which premium
--                 applied, so a Saturday that lost to a holiday can still
--                 be counted as a weekend night.
--
-- Nothing tracks a dependency on a function called from inside another
-- function's body, so dropping this does not cascade to stay_quote. The
-- GRANTs do NOT survive the drop, which is the part that would break the
-- booking site silently — they are reissued at the bottom, and the
-- verification after this migration called both as anon to prove it.
DROP FUNCTION IF EXISTS public.nightly_rate(uuid, date);

CREATE FUNCTION public.nightly_rate(p_property uuid, p_date date)
RETURNS TABLE (rate numeric, base numeric, season text, holiday text,
               premium_pct numeric, premium_kind text, weekend boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH prop AS (
    SELECT p.id, p.base_rate, p.holiday_premium_pct, p.weekend_premium_pct,
           COALESCE(p.country_code, s.country_code, 'ZA') AS cc,
           COALESCE(s.weekend_days, '{5,6}'::smallint[])  AS wdays
      FROM public.properties p
      LEFT JOIN public.org_settings s ON s.org_id = p.org_id
     WHERE p.id = p_property
  ),
  seasoned AS (
    SELECT r.name, r.rate FROM public.rate_seasons r
     WHERE r.property_id = p_property
       AND EXTRACT(MONTH FROM p_date)::int = ANY (r.months)
     ORDER BY r.sort LIMIT 1
  ),
  hol AS (
    SELECT h.name FROM public.public_holidays h, prop
     WHERE h.country_code = prop.cc AND h.holiday_date = p_date
  ),
  calc AS (
    SELECT
      COALESCE(s.rate, p.base_rate) AS base_rate,
      s.name AS season_name,
      hol.name AS holiday_name,
      EXTRACT(ISODOW FROM p_date)::smallint = ANY (p.wdays) AS is_weekend,
      CASE WHEN hol.name IS NOT NULL THEN COALESCE(p.holiday_premium_pct, 0) ELSE 0 END AS hol_pct,
      CASE WHEN EXTRACT(ISODOW FROM p_date)::smallint = ANY (p.wdays)
           THEN COALESCE(p.weekend_premium_pct, 0) ELSE 0 END AS wk_pct
      FROM prop p LEFT JOIN seasoned s ON true LEFT JOIN hol ON true
  )
  SELECT
    CASE WHEN base_rate IS NULL THEN NULL
         ELSE round(base_rate * (1 + GREATEST(hol_pct, wk_pct) / 100.0), 2) END,
    base_rate,
    season_name,
    holiday_name,
    GREATEST(hol_pct, wk_pct),
    -- Ties go to the holiday: it is the more useful thing to tell a guest.
    CASE WHEN GREATEST(hol_pct, wk_pct) = 0 THEN NULL
         WHEN hol_pct >= wk_pct            THEN 'holiday'
         ELSE                                   'weekend' END,
    is_weekend
  FROM calc;
$function$;

COMMENT ON FUNCTION public.nightly_rate(uuid, date) IS
  'What one night costs: the season rate (or the base rate), plus the HIGHER of the weekend and public-holiday premiums — never both compounded. premium_kind says which one applied.';

-- ══════════════════════════════════════════════════════════════════
-- 3. THE WHOLE STAY
-- ══════════════════════════════════════════════════════════════════
--
-- weekend_nights joins holiday_nights so a breakdown can be read back
-- without walking the detail array.
DROP FUNCTION IF EXISTS public.stay_quote(uuid, date, date);

CREATE FUNCTION public.stay_quote(p_property uuid, p_check_in date, p_check_out date)
RETURNS TABLE (nights integer, total numeric, holiday_nights integer,
               weekend_nights integer, unpriced_nights integer, detail jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH d AS (
    SELECT generate_series(p_check_in, p_check_out - 1, interval '1 day')::date AS night
  ),
  priced AS (
    SELECT d.night, r.rate, r.base, r.season, r.holiday, r.premium_pct, r.premium_kind, r.weekend
      FROM d CROSS JOIN LATERAL public.nightly_rate(p_property, d.night) r
  )
  SELECT count(*)::int, sum(rate),
         count(*) FILTER (WHERE holiday IS NOT NULL)::int,
         count(*) FILTER (WHERE weekend)::int,
         count(*) FILTER (WHERE rate IS NULL)::int,
         jsonb_agg(jsonb_build_object(
           'night', night, 'rate', rate, 'season', season,
           'holiday', holiday, 'premium_pct', premium_pct,
           'premium_kind', premium_kind, 'weekend', weekend) ORDER BY night)
    FROM priced;
$function$;

-- ══════════════════════════════════════════════════════════════════
-- 4. THE SIGNED-OUT VERSION THE BOOKING SITE CALLS
-- ══════════════════════════════════════════════════════════════════
--
-- Same reason as 921: anon cannot read public.properties, so the lookup
-- happens in here, keyed on the agency portal key AND the property key
-- because short_key is unique per org and not globally.
DROP FUNCTION IF EXISTS public.public_stay_quote(text, text, date, date);

CREATE FUNCTION public.public_stay_quote(
  p_portal_key text, p_property_key text, p_check_in date, p_check_out date)
RETURNS TABLE (
  nights int, total numeric, holiday_nights int, weekend_nights int,
  unpriced_nights int, cleaning_fee numeric, detail jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_prop uuid; v_fee numeric;
BEGIN
  SELECT p.id, COALESCE(p.cleaning_fee, 0) INTO v_prop, v_fee
    FROM public.properties p
    JOIN public.organizations o ON o.id = p.org_id
   WHERE o.portal_key = p_portal_key
     AND p.short_key = p_property_key
   LIMIT 1;

  IF v_prop IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT q.nights, q.total, q.holiday_nights, q.weekend_nights,
         q.unpriced_nights, v_fee, q.detail
    FROM public.stay_quote(v_prop, p_check_in, p_check_out) q;
END $$;

COMMENT ON FUNCTION public.public_stay_quote(text, text, date, date) IS
  'Price a stay for a signed-out visitor on an agency''s own booking site. Takes the agency portal key AND the property short key, because short_key is unique per org and not globally. Returns the quote and the cleaning fee, and nothing else about the property.';

-- ══════════════════════════════════════════════════════════════════
-- 5. THE GRANTS THE DROP TOOK AWAY
-- ══════════════════════════════════════════════════════════════════
--
-- DROP FUNCTION discards every privilege on it. Miss this and the booking
-- site's quote route answers 503 for every guest and quietly falls back to
-- its own hardcoded table — which is the exact failure 921 was written to
-- prevent, arriving by a different door.
REVOKE ALL ON FUNCTION public.nightly_rate(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nightly_rate(uuid, date) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.stay_quote(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stay_quote(uuid, date, date) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.public_stay_quote(text, text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_stay_quote(text, text, date, date) TO anon, authenticated;

-- End 924_weekend_rates.
