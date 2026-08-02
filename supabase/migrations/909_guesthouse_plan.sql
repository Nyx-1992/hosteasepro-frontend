-- 909_guesthouse_plan.sql
-- Runs on BOTH databases.
--
-- Owner, having seen 908: "A guesthouse needs to be rather a medium plan
-- then."
--
-- Correct, and it revises the decision made an hour earlier. 908 counted a
-- guesthouse as one property so that Starter would be usable by a small
-- guesthouse. That is true and it is the wrong trade: a guesthouse is not
-- a flat with more beds, it is a different operation — daily servicing,
-- per-room calendars, staff on site, more people to coordinate — and it is
-- the customer who gets the most out of HEP. Pricing it as one flat sells
-- the most demanding use of the product for the least money.
--
-- So the rule is now a MINIMUM PLAN rather than a count:
--
--   Starter  R350   up to 2 self-catering properties. No guesthouses.
--   Growth   R550   up to 10 properties, or a guesthouse up to 10 rooms.
--   Pro      R750   more than that.
--
-- 908's org_billable_properties() is unchanged and still counts a
-- guesthouse as one property, because that is what it is asked: how many
-- properties. What changes is that "how many properties" is no longer the
-- only thing that decides the plan.
--
-- ── WHY THIS COMPUTES A MINIMUM RATHER THAN ENFORCING ONE ─────────
--
-- Nothing here blocks anybody. properties_limit has existed since 830 and
-- has never been enforced, and the moment to start is not in the middle of
-- recruiting the first guesthouse testers — several of whom will be comped
-- anyway. What this gives is the ability to SEE it: HQ can show that a
-- customer on Starter has a guesthouse and should be on Growth, which is a
-- conversation to have rather than a door to slam. Enforcement, if it ever
-- comes, reads the same function and so cannot disagree with the screen.

CREATE OR REPLACE FUNCTION public.org_required_plan(p_org uuid)
RETURNS TABLE (plan text, reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH c AS (
    SELECT
      -- Whole properties: flats, houses, and each guesthouse as one.
      count(*) FILTER (WHERE parent_id IS NULL)                     AS units,
      count(*) FILTER (WHERE parent_id IS NOT NULL)                 AS rooms,
      count(*) FILTER (WHERE parent_id IS NULL AND EXISTS (
        SELECT 1 FROM public.properties k WHERE k.parent_id = properties.id)) AS guesthouses
      FROM public.properties
     WHERE org_id = p_org
  )
  SELECT
    CASE WHEN c.units > 10 OR c.rooms > 10 THEN 'pro'
         WHEN c.guesthouses > 0 OR c.units > 2 THEN 'growth'
         ELSE 'starter' END,
    CASE WHEN c.units > 10 THEN c.units || ' properties'
         WHEN c.rooms > 10 THEN c.rooms || ' rooms'
         WHEN c.guesthouses > 0 THEN
           c.guesthouses || ' guesthouse' || CASE WHEN c.guesthouses > 1 THEN 's' ELSE '' END
           || ' (' || c.rooms || ' room' || CASE WHEN c.rooms = 1 THEN '' ELSE 's' END || ')'
         WHEN c.units > 2 THEN c.units || ' properties'
         ELSE c.units || ' propert' || CASE WHEN c.units = 1 THEN 'y' ELSE 'ies' END
    END
  FROM c;
$$;

COMMENT ON FUNCTION public.org_required_plan(uuid) IS
  'The smallest plan that fits what this agency actually runs. A guesthouse requires Growth however few rooms it has — it is a different operation from a flat, not a bigger one. Advisory: nothing is blocked, but HQ can see who is underpaying.';

REVOKE ALL ON FUNCTION public.org_required_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_required_plan(uuid) TO authenticated;

-- ══ THE CUSTOMER LIST LEARNS ABOUT IT ═════════════════════════════
--
-- So the answer is on the screen where the decision gets made, rather than
-- in a query somebody has to remember to run. Postgres will not replace a
-- function whose OUT parameters changed, and summary selects from
-- customers, so both come down together — same dance as 905 and 906.
DROP FUNCTION IF EXISTS public.platform_summary();
DROP FUNCTION IF EXISTS public.platform_customers();

CREATE FUNCTION public.platform_customers()
RETURNS TABLE (
  org_id        uuid,
  name          text,
  portal_key    text,
  plan          text,
  status        text,
  trial_ends_at timestamptz,
  signed_up     timestamptz,
  owner_name    text,
  owner_email   text,
  properties    int,
  rooms         int,
  users         int,
  roles         text,
  staff         int,
  bookings      int,
  last_seen     timestamptz,
  last_payment  timestamptz,
  amount_cents  int,
  note          text,
  needs_plan    text,
  needs_reason  text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.id,
         o.name,
         o.portal_key,
         COALESCE(s.plan, 'none'),
         COALESCE(s.status, 'none'),
         s.trial_ends_at,
         o.created_at,
         owner.name,
         au.email::text,
         (SELECT count(*)::int FROM public.properties x WHERE x.org_id = o.id AND x.parent_id IS NULL),
         (SELECT count(*)::int FROM public.properties x WHERE x.org_id = o.id AND x.parent_id IS NOT NULL),
         (SELECT count(*)::int FROM public.profiles   x WHERE x.org_id = o.id),
         (SELECT string_agg(r.n || ' ' || r.role || CASE WHEN r.n > 1 THEN 's' ELSE '' END, ' · '
                            ORDER BY CASE r.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2
                                                 WHEN 'host'  THEN 3 WHEN 'client' THEN 4
                                                 ELSE 5 END)
            FROM (SELECT p.role, count(*)::int AS n
                    FROM public.profiles p WHERE p.org_id = o.id AND p.role IS NOT NULL
                   GROUP BY p.role) r),
         (SELECT count(*)::int FROM public.team_contacts x WHERE x.org_id = o.id),
         (SELECT count(*)::int FROM public.bookings      x WHERE x.org_id = o.id),
         (SELECT max(u.last_sign_in_at)
            FROM public.profiles pr JOIN auth.users u ON u.id = pr.id
           WHERE pr.org_id = o.id),
         s.last_payment_at,
         s.amount_cents,
         NULLIF(s.notes, ''),
         rp.plan,
         rp.reason
    FROM public.organizations o
    LEFT JOIN public.org_subscriptions s ON s.org_id = o.id
    LEFT JOIN LATERAL public.org_required_plan(o.id) rp ON true
    LEFT JOIN LATERAL (
      SELECT p.id, p.name FROM public.profiles p
       WHERE p.org_id = o.id AND p.role = 'owner'
       ORDER BY p.name LIMIT 1
    ) owner ON true
    LEFT JOIN auth.users au ON au.id = owner.id
   WHERE public.is_platform_owner()
     AND o.id IS DISTINCT FROM (SELECT platform_org_id FROM public.platform_settings)
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.org_id = o.id)
   ORDER BY o.created_at DESC;
$$;

COMMENT ON FUNCTION public.platform_customers() IS
  'One row per agency somebody can sign into, with the plan they are on and the smallest plan that fits what they run. Counts only: no bookings, guests, addresses or income.';

CREATE FUNCTION public.platform_summary()
RETURNS TABLE (customers int, paying int, trialing int, lapsed int, comped int,
  mrr_rand int, trials_ending_7d int, signups_30d int, signups_7d int,
  never_set_up int, quiet_14d int, underplanned int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH c AS (SELECT * FROM public.platform_customers()),
       priced AS (SELECT c.*, CASE c.plan WHEN 'starter' THEN 350 WHEN 'growth' THEN 550
                                          WHEN 'pro' THEN 750 ELSE 0 END AS rand,
                             CASE c.plan       WHEN 'starter' THEN 1 WHEN 'growth' THEN 2 WHEN 'pro' THEN 3 ELSE 0 END AS on_rank,
                             CASE c.needs_plan WHEN 'starter' THEN 1 WHEN 'growth' THEN 2 WHEN 'pro' THEN 3 ELSE 0 END AS need_rank
                    FROM c)
  SELECT count(*)::int,
         count(*) FILTER (WHERE status='active' AND plan IN ('starter','growth','pro'))::int,
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
         -- Paying less than what they run needs. Comped accounts are not
         -- underpaying, they are a decision, so they are excluded.
         count(*) FILTER (WHERE plan <> 'founder' AND on_rank > 0 AND need_rank > on_rank)::int
    FROM priced;
$$;

REVOKE ALL ON FUNCTION public.platform_customers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_summary()   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_customers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_summary()   TO authenticated;

-- End 909_guesthouse_plan.
