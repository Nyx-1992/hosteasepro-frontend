-- 910_two_plan_tracks.sql
-- Runs on BOTH databases.
--
-- Owner: "Maybe it's a separate billing for guesthouses as the logic
-- differs too? We can do a toggle if people are interested in guesthouses
-- or multiple properties."
--
-- Right, and it supersedes 909 — which had a guesthouse merely forcing the
-- Growth tier. That was still pricing a guesthouse as a slightly awkward
-- agency. It is not one. An agency has properties scattered across a city,
-- each with its own address, owner and cleaner. A guesthouse is one
-- building with rooms in it, daily servicing, staff on site and a single
-- front door. Same software underneath, different business, so the thing
-- they are counted on should differ too: PROPERTIES for one, ROOMS for the
-- other.
--
--   Agencies — priced per property
--     Starter  R350   up to 2 properties
--     Growth   R550   up to 10 properties
--     Pro      R750   unlimited
--
--   Guesthouses — priced per room
--     Guesthouse       R400   up to 6 rooms
--     Guesthouse Plus  R600   up to 15 rooms
--     Guesthouse Pro   R900   unlimited rooms
--
-- MIXED CUSTOMERS: the guesthouse plan covers everything. Somebody with a
-- guesthouse and three flats pays the guesthouse tier and the flats ride
-- along free. The owner's call, and the right one — mixed customers are
-- rare enough that the generosity costs almost nothing, and "you'll be
-- billed twice" is a bad first invoice.
--
-- ── STILL ADVISORY ────────────────────────────────────────────────
--
-- Nothing here blocks anybody, exactly as in 909. properties_limit has
-- never been enforced and the middle of recruiting the first guesthouse
-- testers is not when to start. What this gives is the ability to SEE who
-- has outgrown their tier, which is a conversation rather than a locked
-- door.

-- ══ ONE PLACE THAT KNOWS WHAT THINGS COST ═════════════════════════
--
-- Mirrors api/_lib/payfast.js, which stays the authority because the
-- server decides what is actually charged. This copy exists so the
-- dashboard's MRR cannot quietly disagree with the invoice — before now
-- the price list was written out longhand in platform_summary(), the app
-- and payfast.js, and the three had already drifted: payfast.js allowed
-- Growth 8 properties while the pricing page advertised 10.
CREATE OR REPLACE FUNCTION public.plan_price_rand(p_plan text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_plan
    WHEN 'starter'   THEN 350
    WHEN 'growth'    THEN 550
    WHEN 'pro'       THEN 750
    WHEN 'gh_small'  THEN 400
    WHEN 'gh_medium' THEN 600
    WHEN 'gh_large'  THEN 900
    ELSE 0                       -- trial, founder, none
  END;
$$;

CREATE OR REPLACE FUNCTION public.plan_track(p_plan text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_plan LIKE 'gh\_%' THEN 'guesthouse'
              WHEN p_plan IN ('starter','growth','pro') THEN 'property'
              ELSE 'none' END;
$$;

COMMENT ON FUNCTION public.plan_price_rand(text) IS
  'Monthly rand price of a plan. Mirrors api/_lib/payfast.js, which is the authority — this copy stops the dashboard disagreeing with the invoice.';

REVOKE ALL ON FUNCTION public.plan_price_rand(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.plan_track(text)      FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plan_price_rand(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_track(text)      TO authenticated;

-- ══ WHICH PLAN DOES THIS AGENCY ACTUALLY NEED ═════════════════════
CREATE OR REPLACE FUNCTION public.org_required_plan(p_org uuid)
RETURNS TABLE (plan text, reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH c AS (
    SELECT
      count(*) FILTER (WHERE parent_id IS NULL)     AS units,
      count(*) FILTER (WHERE parent_id IS NOT NULL) AS rooms,
      count(*) FILTER (WHERE parent_id IS NULL AND EXISTS (
        SELECT 1 FROM public.properties k WHERE k.parent_id = properties.id)) AS guesthouses
      FROM public.properties
     WHERE org_id = p_org
  )
  SELECT
    CASE
      -- A guesthouse puts you on the guesthouse track, counted on rooms.
      -- Any separate flats come along at no extra charge.
      WHEN c.guesthouses > 0 THEN
        CASE WHEN c.rooms <= 6 THEN 'gh_small'
             WHEN c.rooms <= 15 THEN 'gh_medium'
             ELSE 'gh_large' END
      WHEN c.units > 10 THEN 'pro'
      WHEN c.units > 2  THEN 'growth'
      ELSE 'starter'
    END,
    CASE
      WHEN c.guesthouses > 0 THEN
        c.rooms || ' room' || CASE WHEN c.rooms = 1 THEN '' ELSE 's' END
        || CASE WHEN c.guesthouses > 1 THEN ' across ' || c.guesthouses || ' guesthouses' ELSE '' END
        || CASE WHEN c.units - c.guesthouses > 0
                THEN ' + ' || (c.units - c.guesthouses) || ' separate propert'
                     || CASE WHEN c.units - c.guesthouses = 1 THEN 'y' ELSE 'ies' END
                ELSE '' END
      ELSE c.units || ' propert' || CASE WHEN c.units = 1 THEN 'y' ELSE 'ies' END
    END
  FROM c;
$$;

COMMENT ON FUNCTION public.org_required_plan(uuid) IS
  'The smallest plan that fits what this agency runs. A guesthouse moves them onto the room-priced track and their separate properties are included. Advisory only — nothing is blocked.';

REVOKE ALL ON FUNCTION public.org_required_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_required_plan(uuid) TO authenticated;

-- ══ THE SUMMARY LEARNS THE NEW PRICES ═════════════════════════════
--
-- MRR read from plan_price_rand() rather than a CASE written out again
-- here. The old version listed starter/growth/pro longhand, so a
-- guesthouse customer would have counted as R0 of monthly revenue —
-- silently, on the one screen whose whole job is to say what the business
-- earns.
--
-- "Underplanned" is compared BY PRICE, not by tier rank. Rank does not
-- survive two tracks: gh_small is neither above nor below 'growth' in any
-- ordering that means anything, but R400 versus R550 always does.
DROP FUNCTION IF EXISTS public.platform_summary();

CREATE FUNCTION public.platform_summary()
RETURNS TABLE (customers int, paying int, trialing int, lapsed int, comped int,
  mrr_rand int, trials_ending_7d int, signups_30d int, signups_7d int,
  never_set_up int, quiet_14d int, underplanned int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH c AS (SELECT * FROM public.platform_customers()),
       priced AS (
         SELECT c.*,
                public.plan_price_rand(c.plan)       AS rand,
                public.plan_price_rand(c.needs_plan) AS needs_rand
           FROM c
       )
  SELECT count(*)::int,
         count(*) FILTER (WHERE status='active' AND public.plan_track(plan) <> 'none')::int,
         count(*) FILTER (WHERE status='trialing')::int,
         count(*) FILTER (WHERE status IN ('cancelled','canceled','past_due','lapsed'))::int,
         count(*) FILTER (WHERE plan='founder')::int,
         COALESCE(sum(rand) FILTER (WHERE status='active'),0)::int,
         count(*) FILTER (WHERE status='trialing' AND trial_ends_at IS NOT NULL
                            AND trial_ends_at <= now() + interval '7 days')::int,
         count(*) FILTER (WHERE signed_up >= now() - interval '30 days')::int,
         count(*) FILTER (WHERE signed_up >= now() - interval '7 days')::int,
         count(*) FILTER (WHERE properties = 0)::int,
         count(*) FILTER (WHERE properties > 0 AND (last_seen IS NULL OR last_seen < now() - interval '14 days'))::int,
         -- Paying for less than they run. A comped account is a decision,
         -- not an underpayment, and a trial has not chosen anything yet.
         count(*) FILTER (WHERE plan <> 'founder' AND rand > 0 AND needs_rand > rand)::int
    FROM priced;
$$;

REVOKE ALL ON FUNCTION public.platform_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_summary() TO authenticated;

-- platform_customers() is unchanged: it already returns needs_plan and
-- needs_reason from org_required_plan(), which now answers differently.

-- End 910_two_plan_tracks.
