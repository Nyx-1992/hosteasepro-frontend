-- 921_public_stay_quote.sql
-- Runs on BOTH databases.
--
-- Quote a stay to somebody who is not signed in, without showing them the
-- properties table.
--
-- ══ THE BUG THIS WAS WRITTEN TO AVOID ════════════════════════════
--
-- sunsetcoaststays.co.za was about to look up a property by short_key with
-- the anon key and then call stay_quote() with the id it found. That does
-- not work and, worse, does not fail loudly: anon cannot read
-- public.properties — its three policies are org-member, client, and admin
-- — so the lookup returns nothing, the route answers 404 every time, and
-- the booking form falls back to its own hardcoded table for ever. The
-- change would have looked done and done nothing.
--
-- Caught by running the query as the anon role before shipping it.
--
-- ══ WHY NOT JUST LET anon READ properties ════════════════════════
--
-- Because that is every agency's property list — names, addresses,
-- cleaning fees — readable by anyone on the internet. The booking site
-- needs ONE number about ONE property, so it gets a function that returns
-- that and nothing else.
--
-- ══ SCOPED BY AGENCY, NOT JUST BY KEY ════════════════════════════
--
-- short_key is unique per ORG, not globally: two agencies can both have a
-- 'speranta'. A function keyed on short_key alone would pick one with
-- LIMIT 1 and could quote a stranger's property on S&N's booking site — a
-- silent cross-tenant leak of exactly the kind this codebase keeps having
-- to be careful about.
--
-- So it takes the agency's portal_key too. That is already a public
-- identifier (it is in every staff portal URL), it is not a credential,
-- and it makes the pair unambiguous.

CREATE OR REPLACE FUNCTION public.public_stay_quote(
  p_portal_key text, p_property_key text, p_check_in date, p_check_out date)
RETURNS TABLE (
  nights int, total numeric, holiday_nights int, unpriced_nights int,
  cleaning_fee numeric, detail jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_prop uuid; v_fee numeric;
BEGIN
  SELECT p.id, COALESCE(p.cleaning_fee, 0) INTO v_prop, v_fee
    FROM public.properties p
    JOIN public.organizations o ON o.id = p.org_id
   WHERE o.portal_key = p_portal_key
     AND p.short_key = p_property_key
   LIMIT 1;

  -- No such pairing. Returns nothing rather than raising: an unknown
  -- property on a booking site is a 404, not an error worth a stack trace.
  IF v_prop IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT q.nights, q.total, q.holiday_nights, q.unpriced_nights, v_fee, q.detail
    FROM public.stay_quote(v_prop, p_check_in, p_check_out) q;
END $$;

COMMENT ON FUNCTION public.public_stay_quote(text, text, date, date) IS
  'Price a stay for a signed-out visitor on an agency''s own booking site. Takes the agency portal key AND the property short key, because short_key is unique per org and not globally — keyed on short_key alone this would quote another agency''s property. Returns the quote and the cleaning fee, and nothing else about the property.';

REVOKE ALL ON FUNCTION public.public_stay_quote(text, text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_stay_quote(text, text, date, date) TO anon, authenticated;

-- End 921_public_stay_quote.
