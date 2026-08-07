-- 915_rates_and_holidays.sql
-- Runs on BOTH databases.
--
-- Owner: "Considering public holiday rates, based on the country the
-- property is in. These should be higher rate nights."
--
-- ══ THERE WAS NO PRICE IN THIS PRODUCT ═══════════════════════════
--
-- HEP stores cleaning_fee and nothing else about money in. Bookings arrive
-- from the platforms with a total already decided, so the product has
-- never needed to know what a night costs — and consequently cannot answer
-- "what should this night cost", which is what holiday pricing is.
--
-- The one place a nightly rate exists is data/listings.ts on the booking
-- site: a TypeScript file, hardcoded, holding S&N's two flats and their
-- summer/shoulder/winter rates. Changing a price is a deploy, and no HEP
-- customer has any pricing at all.
--
-- So this is the floor that holiday rates stand on: rates move into the
-- database, per property, for every agency.
--
-- ══ WHAT THIS CANNOT DO, SAID OUT LOUD ═══════════════════════════
--
-- It cannot change a price on Airbnb, Booking.com or LekkeSlaap. iCal is a
-- one-way calendar feed; setting rates needs each platform's own API, and
-- those are partner-gated or certification-gated. Holiday rates therefore
-- govern DIRECT bookings — the ones with no commission on them — and
-- everywhere else they are a prompt to go and change it yourself.
--
-- That is worth building and it is not the whole win, and the difference
-- should be obvious from the screen rather than discovered later.

-- ══ 1. WHERE A PROPERTY IS ════════════════════════════════════════
--
-- properties.country already existed as free text and is empty on every
-- row, which is no use for looking up a holiday calendar. A 2-letter ISO
-- code is, so that is a separate column rather than a cleanup of the old
-- one: somebody's "South Africa" and somebody else's "RSA" both mean ZA,
-- and guessing which is which is not a migration's job.
--
-- The agency sets its country once; a property only needs its own if it is
-- somewhere else. ZA is the default because it is the market HEP launched
-- in, not because it is S&N's — any agency changes it in one field.
ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'ZA';
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS country_code text;

COMMENT ON COLUMN public.properties.country_code IS
  'ISO 3166-1 alpha-2, only when this property sits in a different country from the agency. NULL means "same as the agency", which is true of nearly every property.';

-- ══ 2. WHAT A NIGHT COSTS ═════════════════════════════════════════
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS base_rate numeric,
  ADD COLUMN IF NOT EXISTS holiday_premium_pct numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.properties.base_rate IS
  'Standard nightly rate. NULL means this property has no price set, and the quote functions return NULL rather than 0 — a free night and an unpriced one are different, and only one of them should ever be shown to a guest.';

COMMENT ON COLUMN public.properties.holiday_premium_pct IS
  'Percentage added on a public holiday, e.g. 40 for +40%. A percentage rather than a rand amount so it scales with the season by itself: a holiday in peak summer is worth more than one in winter, and nobody has to remember to set two numbers.';

-- Seasons. Months rather than dates, because a season is a recurring shape
-- of the year and re-entering "peak = 1 Nov to 28 Feb" every December is
-- the sort of chore that quietly stops happening.
CREATE TABLE IF NOT EXISTS public.rate_seasons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name        text NOT NULL,
  months      int[] NOT NULL,       -- 1-12, human numbering
  rate        numeric NOT NULL,
  sort        int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_seasons_property_idx ON public.rate_seasons (property_id);

ALTER TABLE public.rate_seasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rate_seasons_own_org ON public.rate_seasons;
CREATE POLICY rate_seasons_own_org ON public.rate_seasons FOR ALL
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_seasons TO authenticated;

-- NOT granted to anon, deliberately. The booking site does quote a price
-- before anybody signs in, but it does that through nightly_rate() and
-- stay_quote() below, which are SECURITY DEFINER and reach past RLS on
-- purpose. A table grant would achieve nothing on top of that — the policy
-- above tests org_id = current_org_id(), and current_org_id() is NULL for a
-- signed-out visitor, so every row is filtered out anyway — while looking
-- like a decision somebody made. It would then become a real hole the first
-- time anyone loosened the policy.
--
-- The REVOKE is not paranoia either: Supabase's default privileges hand
-- anon ALL on every new table in the public schema, so a table created here
-- arrives writable-by-anon and is held shut by RLS alone. That is true of
-- all 55 tables in this database and is not this migration's to fix, but a
-- new table may as well not add to it.
REVOKE ALL ON public.rate_seasons FROM anon;

COMMENT ON TABLE public.rate_seasons IS
  'Nightly rate by time of year, per property. Months are 1-12. A month in no season falls back to properties.base_rate.';

-- ══ 3. PUBLIC HOLIDAYS ════════════════════════════════════════════
--
-- Facts about a country, not about an agency — so one table shared by
-- everyone, with no org_id and no RLS beyond "anyone may read it". Two
-- agencies in Cape Town do not each need their own copy of Freedom Day.
CREATE TABLE IF NOT EXISTS public.public_holidays (
  country_code text NOT NULL,
  holiday_date date NOT NULL,
  name         text NOT NULL,
  source       text NOT NULL DEFAULT 'builtin',
  PRIMARY KEY (country_code, holiday_date)
);
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_holidays_readable ON public.public_holidays;
CREATE POLICY public_holidays_readable ON public.public_holidays FOR SELECT USING (true);
-- Readable by everyone, writable by nobody through the API. Holidays are
-- seeded by the functions below and refreshed by a cron that uses the
-- service key; no browser ever needs to write here.
REVOKE ALL ON public.public_holidays FROM anon, authenticated;
GRANT SELECT ON public.public_holidays TO anon, authenticated;

COMMENT ON TABLE public.public_holidays IS
  'Public holidays by country and date. Seeded here for South Africa, computed rather than typed; other countries are filled from an external calendar by /api/cron/holidays.';

-- ── Easter, so the moveable ones can be computed ──────────────────
--
-- Good Friday and Family Day are the two South African holidays that are
-- not on a fixed date, and they move with Easter, which moves with the
-- moon. The anonymous Gregorian algorithm is the standard closed form;
-- worth having because the alternative is typing two dates a year forever
-- and noticing the year somebody forgot.
CREATE OR REPLACE FUNCTION public.easter_sunday(p_year int)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE a int; b int; c int; d int; e int; f int; g int; h int; i int;
        k int; l int; m int; mo int; da int;
BEGIN
  a := p_year % 19;
  b := p_year / 100;
  c := p_year % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mo := (h + l - 7 * m + 114) / 31;
  da := ((h + l - 7 * m + 114) % 31) + 1;
  RETURN make_date(p_year, mo, da);
END $$;

-- ── South Africa ──────────────────────────────────────────────────
--
-- Includes the rule most calendars get wrong: under the Public Holidays
-- Act, a holiday falling on a SUNDAY moves the public holiday to the
-- Monday. Miss it and the busiest long weekends of the year are priced as
-- ordinary Mondays.
CREATE OR REPLACE FUNCTION public.seed_sa_holidays(p_year int)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int; easter date;
BEGIN
  easter := public.easter_sunday(p_year);

  WITH fixed(d, nm) AS (VALUES
    (make_date(p_year,  1,  1), 'New Year''s Day'),
    (make_date(p_year,  3, 21), 'Human Rights Day'),
    (make_date(p_year,  4, 27), 'Freedom Day'),
    (make_date(p_year,  5,  1), 'Workers'' Day'),
    (make_date(p_year,  6, 16), 'Youth Day'),
    (make_date(p_year,  8,  9), 'National Women''s Day'),
    (make_date(p_year,  9, 24), 'Heritage Day'),
    (make_date(p_year, 12, 16), 'Day of Reconciliation'),
    (make_date(p_year, 12, 25), 'Christmas Day'),
    (make_date(p_year, 12, 26), 'Day of Goodwill')
  ),
  moveable(d, nm) AS (VALUES
    (easter - 2, 'Good Friday'),
    (easter + 1, 'Family Day')
  ),
  all_days AS (SELECT d, nm FROM fixed UNION ALL SELECT d, nm FROM moveable),
  -- The Sunday rule. Good Friday and Family Day never land on a Sunday, so
  -- applying it to everything is harmless as well as correct.
  observed AS (
    SELECT CASE WHEN EXTRACT(DOW FROM d) = 0 THEN d + 1 ELSE d END AS d,
           CASE WHEN EXTRACT(DOW FROM d) = 0 THEN nm || ' (observed)' ELSE nm END AS nm
      FROM all_days
  )
  INSERT INTO public.public_holidays (country_code, holiday_date, name, source)
  SELECT 'ZA', d, nm, 'builtin' FROM observed
  ON CONFLICT (country_code, holiday_date) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- This year and the next three, so a booking taken today for next Easter
-- is priced correctly. /api/cron/holidays keeps it rolling.
SELECT public.seed_sa_holidays(g)
  FROM generate_series(EXTRACT(YEAR FROM CURRENT_DATE)::int,
                       EXTRACT(YEAR FROM CURRENT_DATE)::int + 3) g;

-- ══ 4. WHAT DOES THIS NIGHT COST ══════════════════════════════════
--
-- One function, so the booking site, the HEP screen and any future
-- reporting cannot disagree about a price a guest was quoted.
--
-- Returns the reason as well as the number. "R1,680" is a figure to argue
-- with; "Peak Summer R1,200 +40% Heritage Day" is one to explain.
CREATE OR REPLACE FUNCTION public.nightly_rate(p_property uuid, p_date date)
RETURNS TABLE (rate numeric, base numeric, season text, holiday text, premium_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH prop AS (
    SELECT p.id, p.base_rate, p.holiday_premium_pct,
           COALESCE(p.country_code, s.country_code, 'ZA') AS cc
      FROM public.properties p
      LEFT JOIN public.org_settings s ON s.org_id = p.org_id
     WHERE p.id = p_property
  ),
  seasoned AS (
    SELECT r.name, r.rate
      FROM public.rate_seasons r
     WHERE r.property_id = p_property
       AND EXTRACT(MONTH FROM p_date)::int = ANY (r.months)
     ORDER BY r.sort LIMIT 1
  ),
  hol AS (
    SELECT h.name FROM public.public_holidays h, prop
     WHERE h.country_code = prop.cc AND h.holiday_date = p_date
  )
  SELECT
    -- An unpriced property returns NULL, not 0. A free night and a night
    -- nobody has priced are different things, and only one of them should
    -- ever reach a guest.
    CASE WHEN COALESCE(s.rate, p.base_rate) IS NULL THEN NULL
         ELSE round(COALESCE(s.rate, p.base_rate)
                    * (1 + CASE WHEN hol.name IS NOT NULL
                                THEN COALESCE(p.holiday_premium_pct, 0) / 100.0
                                ELSE 0 END), 2)
    END,
    COALESCE(s.rate, p.base_rate),
    s.name,
    hol.name,
    CASE WHEN hol.name IS NOT NULL THEN COALESCE(p.holiday_premium_pct, 0) ELSE 0 END
  FROM prop p
  LEFT JOIN seasoned s ON true
  LEFT JOIN hol ON true;
$$;

COMMENT ON FUNCTION public.nightly_rate(uuid, date) IS
  'What one night costs and why: the season it fell in, the holiday if any, and the premium applied. Returns NULL rather than 0 for a property with no rate set.';

REVOKE ALL ON FUNCTION public.nightly_rate(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nightly_rate(uuid, date) TO anon, authenticated;

-- ══ 5. WHAT DOES THE STAY COST ════════════════════════════════════
--
-- Priced night by night rather than nights × rate, because that is the
-- whole point: a four-night Easter weekend is not four identical nights,
-- and a total that pretends otherwise is wrong in the guest's favour or
-- yours, never neither.
--
-- Check-out day is not charged. It is not a night slept.
CREATE OR REPLACE FUNCTION public.stay_quote(p_property uuid, p_check_in date, p_check_out date)
RETURNS TABLE (nights int, total numeric, holiday_nights int, unpriced_nights int, detail jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH d AS (
    SELECT generate_series(p_check_in, p_check_out - 1, interval '1 day')::date AS night
  ),
  priced AS (
    SELECT d.night, r.rate, r.base, r.season, r.holiday, r.premium_pct
      FROM d CROSS JOIN LATERAL public.nightly_rate(p_property, d.night) r
  )
  SELECT count(*)::int,
         sum(rate),
         count(*) FILTER (WHERE holiday IS NOT NULL)::int,
         -- Surfaced rather than silently treated as zero: a quote missing
         -- three nights' price is not a cheaper quote, it is a broken one.
         count(*) FILTER (WHERE rate IS NULL)::int,
         jsonb_agg(jsonb_build_object(
           'night', night, 'rate', rate, 'season', season,
           'holiday', holiday, 'premium_pct', premium_pct) ORDER BY night)
    FROM priced;
$$;

COMMENT ON FUNCTION public.stay_quote(uuid, date, date) IS
  'Total for a stay, priced night by night so a holiday weekend costs what it should. Check-out day is not charged. unpriced_nights is non-zero when the property has no rate for some night — a quote missing a price is broken, not cheap.';

REVOKE ALL ON FUNCTION public.stay_quote(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stay_quote(uuid, date, date) TO anon, authenticated;

-- Nothing is backfilled. Every property starts with base_rate NULL and a
-- 0% premium, which means "no price set" — the same as today, and visible
-- as such rather than quietly quoting zero.

-- End 915_rates_and_holidays.
