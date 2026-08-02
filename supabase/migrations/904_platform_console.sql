-- 904_platform_console.sql
-- Runs on BOTH databases.
--
-- Owner: "I need my info@hosteasepro.com login to be a real usable
-- dashboard to manage my company. I don't need to see properties, but how
-- many customers signed up, how many paying customers do I have, anything
-- of interest for me as a business."
--
-- ══ THE PROBLEM THIS SOLVES ═══════════════════════════════════════
--
-- Every policy in this schema scopes to current_org_id(). That is correct
-- and is what makes HEP safe to sell — but it means the platform owner,
-- signed into HOSTEASE PRO's own org, can see exactly one org: her own,
-- which has no customers in it. There is no way to count subscribers from
-- the client at all.
--
-- ══ WHAT THIS DELIBERATELY DOES NOT EXPOSE ════════════════════════
--
-- Counts and money. Never contents. No bookings, no guests, no addresses,
-- no income figures, no staff names, no property names. The owner's
-- position, asked directly, was "I aim to say no" to reading a customer's
-- data, and the point of that answer is that it can be said to a customer
-- out loud: an agency evaluating HEP against a competitor can be told
-- their guests and their revenue are not visible to us, and that stays
-- true only while there is no function that returns them.
--
-- A per-customer support view, switched on by the customer and audited,
-- is a separate decision and a separate migration.

-- ══ WHO IS ALLOWED ════════════════════════════════════════════════
-- One place, so the two functions below cannot drift apart.
CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
      CROSS JOIN public.platform_settings s
     WHERE p.id = auth.uid()
       AND p.role = 'owner'
       AND s.platform_org_id IS NOT NULL
       AND p.org_id = s.platform_org_id
  );
$$;

COMMENT ON FUNCTION public.is_platform_owner() IS
  'True only for an owner whose profile belongs to the org named by platform_settings.platform_org_id. Mirrors isPlatformOwner() in the page, but the page''s copy is a convenience — this one is the check that matters, because a browser can be told anything.';

-- ══ THE CUSTOMER LIST ═════════════════════════════════════════════
--
-- One row per agency. The platform's own org is excluded: HEP is not its
-- own customer, and counting it inflates every number on the screen.
CREATE OR REPLACE FUNCTION public.platform_customers()
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
  staff         int,
  bookings      int,
  last_seen     timestamptz,
  last_payment  timestamptz,
  amount_cents  int
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
         (SELECT count(*)::int FROM public.properties    x WHERE x.org_id = o.id),
         (SELECT count(*)::int FROM public.team_contacts x WHERE x.org_id = o.id),
         (SELECT count(*)::int FROM public.bookings      x WHERE x.org_id = o.id),
         -- "Are they actually using it." An agency paying every month that
         -- nobody has signed into for three weeks is about to cancel, and
         -- that is worth knowing before they do rather than after.
         (SELECT max(u.last_sign_in_at)
            FROM public.profiles pr JOIN auth.users u ON u.id = pr.id
           WHERE pr.org_id = o.id),
         s.last_payment_at,
         s.amount_cents
    FROM public.organizations o
    LEFT JOIN public.org_subscriptions s ON s.org_id = o.id
    LEFT JOIN LATERAL (
      SELECT p.id, p.name FROM public.profiles p
       WHERE p.org_id = o.id AND p.role = 'owner'
       ORDER BY p.name LIMIT 1
    ) owner ON true
    LEFT JOIN auth.users au ON au.id = owner.id
   WHERE public.is_platform_owner()
     AND o.id IS DISTINCT FROM (SELECT platform_org_id FROM public.platform_settings)
   ORDER BY o.created_at DESC;
$$;

COMMENT ON FUNCTION public.platform_customers() IS
  'One row per paying or trialling agency: who they are, what they pay, how much they use it. Counts only — no bookings, guests, addresses or income. Returns nothing at all to anyone who is not the platform owner.';

-- ══ THE NUMBERS AT THE TOP ════════════════════════════════════════
--
-- Money and growth together, because the owner''s answer to which matters
-- more was "all of these are important, especially as a startup" — and at
-- this size that is right: revenue without signups is a business that
-- stops, signups without revenue is a hobby.
--
-- MRR is computed from the PLAN, not from amount_cents, and the two are
-- different on purpose. amount_cents records what PayFast actually took,
-- which is null until a payment clears; plan is what they are signed up
-- for. A dashboard that only counted cleared payments would read R0 for a
-- customer who signed up this morning.
CREATE OR REPLACE FUNCTION public.platform_summary()
RETURNS TABLE (
  customers         int,
  paying            int,
  trialing          int,
  lapsed            int,
  comped            int,
  mrr_rand          int,
  trials_ending_7d  int,
  signups_30d       int,
  signups_7d        int,
  never_set_up      int,
  quiet_14d         int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH c AS (SELECT * FROM public.platform_customers()),
       priced AS (
         SELECT c.*,
                CASE c.plan WHEN 'starter' THEN 350
                            WHEN 'growth'  THEN 550
                            WHEN 'pro'     THEN 750
                            ELSE 0 END AS rand
           FROM c
       )
  SELECT count(*)::int,
         count(*) FILTER (WHERE status = 'active' AND plan IN ('starter','growth','pro'))::int,
         count(*) FILTER (WHERE status = 'trialing')::int,
         -- 'lapsed' is anything that was a customer and is not now. Kept
         -- separate from trialing: a trial that ends is not a loss, a
         -- subscription that stops is.
         count(*) FILTER (WHERE status IN ('cancelled','canceled','past_due','lapsed'))::int,
         count(*) FILTER (WHERE plan = 'founder')::int,
         COALESCE(sum(rand) FILTER (WHERE status = 'active'), 0)::int,
         count(*) FILTER (WHERE status = 'trialing'
                            AND trial_ends_at IS NOT NULL
                            AND trial_ends_at <= now() + interval '7 days')::int,
         count(*) FILTER (WHERE signed_up >= now() - interval '30 days')::int,
         count(*) FILTER (WHERE signed_up >= now() - interval '7 days')::int,
         -- Signed up and never added a property. They have not started, and
         -- they will not convert on their own.
         count(*) FILTER (WHERE properties = 0)::int,
         -- Has properties but nobody has signed in for a fortnight.
         count(*) FILTER (WHERE properties > 0
                            AND (last_seen IS NULL OR last_seen < now() - interval '14 days'))::int
    FROM priced;
$$;

COMMENT ON FUNCTION public.platform_summary() IS
  'The top of the platform dashboard: money and growth in one row, plus the four things that need chasing — trials about to end, signups that never added a property, customers who have gone quiet, and payments that stopped.';

REVOKE ALL ON FUNCTION public.is_platform_owner()   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_customers()  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_summary()    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_owner()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_customers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_summary()   TO authenticated;
-- Not anon. There is no signed-out view of the customer list.

-- End 904_platform_console.
