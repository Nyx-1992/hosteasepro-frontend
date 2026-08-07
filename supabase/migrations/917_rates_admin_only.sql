-- 917_rates_admin_only.sql
-- Runs on BOTH databases.
--
-- Owner, on seeing the rates screen: "Also the rates are admin only viewed
-- I hope."
--
-- ══ THE SCREEN WAS. THE DATABASE WAS NOT. ════════════════════════
--
-- Settings is roles:['owner','admin'], so the rates form is out of reach
-- for anybody else in the app. That is where the protection stopped.
--
-- 915 gave rate_seasons the simplest possible policy — org_id =
-- current_org_id(), FOR ALL — which is the right shape for a table every
-- team member uses and the wrong one for this. The org's roles are owner,
-- admin, host and client, and under that policy a HOST could read the
-- whole pricing structure and, worse, WRITE it: change a season's rate,
-- delete peak summer, set a property to R1 a night. Not through the
-- interface, which never shows them the door, but the door was not locked
-- and the API is a fetch call away.
--
-- properties already knew this. Its policies split read from write:
-- properties_select lets any org member see a property, properties_modify
-- requires is_org_admin(). rate_seasons simply had not been given the same
-- treatment. This is that treatment, and it is stricter — a season is not
-- something a host has any reason to read either.
--
-- ══ WHAT STAYS DELIBERATELY OPEN ═════════════════════════════════
--
-- nightly_rate() and stay_quote() remain callable by anon, and that is not
-- an oversight. A guest on the booking site is quoted a price before they
-- sign in — there is no version of a booking site where the price is
-- behind a login. Those functions are SECURITY DEFINER precisely so the
-- table underneath can be shut while the quote stays available, which is
-- the arrangement this migration completes rather than contradicts.
--
-- The information they expose is the price of a stay, which is the number
-- printed on the website. What is now closed is the pricing STRUCTURE —
-- every season, every rate, every property at once, and the ability to
-- change any of it.

-- ── Reads and writes, both to owner and admin ─────────────────────
DROP POLICY IF EXISTS rate_seasons_own_org ON public.rate_seasons;

CREATE POLICY rate_seasons_admin ON public.rate_seasons FOR ALL
  USING      (auth.role() = 'authenticated' AND public.is_org_admin(org_id))
  WITH CHECK (auth.role() = 'authenticated' AND public.is_org_admin(org_id));

COMMENT ON TABLE public.rate_seasons IS
  'Nightly rate by time of year, per property. Months are 1-12. A month in no season falls back to properties.base_rate. Owner and admin only — a host has no reason to read the pricing structure and certainly none to change it. The booking site reads prices through nightly_rate()/stay_quote(), which are SECURITY DEFINER and reach past this.';

-- ── The writer function checks the role too ───────────────────────
--
-- set_rate_seasons() is SECURITY DEFINER, so the policy above does not
-- apply inside it — it checked only that the property belonged to the
-- caller's org. That was enough when any org member could write seasons
-- anyway; now that they cannot, the function would be the way around it.
-- A gate is worth nothing if the back door is a function call.
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

  IF NOT public.is_org_admin(v_org) THEN
    RAISE EXCEPTION 'Only an owner or admin can change rates';
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

REVOKE ALL ON FUNCTION public.set_rate_seasons(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_rate_seasons(uuid, jsonb) TO authenticated;

-- ── ON properties.base_rate AND holiday_premium_pct ───────────────
--
-- These two columns are NOT locked here, and the reason is worth writing
-- down rather than leaving as an apparent oversight.
--
-- They sit on public.properties, which properties_select makes readable by
-- every org member because the rest of the row — name, address, cleaning
-- fee — is what the app runs on. Hiding two columns from a table everyone
-- reads means column-level GRANTs, and a column-level REVOKE makes
-- PostgREST reject `select=*` outright: every host would get a 403 loading
-- the properties list, not a row with two blanks. That is a real change to
-- how the app fetches, not a policy tweak.
--
-- So the honest position: a host can see WHAT a property costs per night.
-- They can no longer see the season structure, and they can no longer
-- change anything. Writes to properties already required is_org_admin()
-- via properties_modify, so the rate columns were never editable by a host.
--
-- Closing that last gap is a view plus a fetch change, and it is a
-- deliberate next step rather than a thing quietly half-done here.

-- End 917_rates_admin_only.
