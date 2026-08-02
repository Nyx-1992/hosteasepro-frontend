-- 905_customer_definition.sql
-- Runs on BOTH databases.
--
-- Owner, reading the new customer list: "TV House and Speranta and all show
-- as separate customers but technically fall all under ONE organization
-- with various roles. So the breakdown should be more organization —
-- property count — users (roles)."
--
-- Correct on both points.
--
-- ══ 1. WHAT COUNTS AS A CUSTOMER ══════════════════════════════════
--
-- 'Speranta Holdings' and 'TV House' are rows in organizations, created
-- 2025-11-17, three days after S&N — left over from an early design where
-- each PROPERTY got its own org. They hold nothing: no logins, no
-- properties, no bookings, no contacts, no finance rows. Nobody can sign
-- into them, because no profile belongs to them.
--
-- They inflated every number on the platform dashboard: 4 customers when
-- there is one real agency, and a "3 signed up but never added a property"
-- warning that was mostly these two haunting the screen.
--
-- The fix is a definition rather than a list of exceptions: A CUSTOMER IS
-- AN ORGANISATION SOMEBODY CAN SIGN INTO. An org with no profile has no
-- user, cannot be reached, and was never a customer. That rule keeps
-- working for the next orphan without anyone remembering these two.
--
-- ══ 2. ONE ORG, MANY ROLES ════════════════════════════════════════
--
-- The list showed a staff count from team_contacts — cleaners and
-- caretakers, people who do not sign in. What it did not show is who
-- actually has a LOGIN and as what, which is the shape of the customer:
-- one agency, some properties, and a handful of people with different
-- levels of access. S&N is 4 logins across owner/admin/host/client, 2
-- properties, 18 contacts — one customer, not three.
-- The row type gains two columns, and Postgres will not replace a function
-- whose OUT parameters changed. Summary first: it selects from customers,
-- so dropping customers while summary still references it fails.
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
  users         int,
  roles         text,
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
         (SELECT count(*)::int FROM public.properties x WHERE x.org_id = o.id),
         (SELECT count(*)::int FROM public.profiles   x WHERE x.org_id = o.id),
         -- "2 owners · 1 admin · 1 host", most senior first. Ordered by an
         -- explicit rank, not alphabetically, so the person who pays is not
         -- listed after the cleaner.
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
     -- See above: no login, no customer.
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.org_id = o.id)
   ORDER BY o.created_at DESC;
$$;

COMMENT ON FUNCTION public.platform_customers() IS
  'One row per agency that somebody can actually sign into. Organisations with no profile are excluded — they are leftovers from an earlier data model, not customers, and counting them overstated both the customer total and the "never got started" warning. Counts only: no bookings, guests, addresses or income.';

-- platform_summary() reads platform_customers(), so it inherits the new
-- definition and needs no change. Recreated only because its column list
-- is checked against the row type it selects from.
CREATE FUNCTION public.platform_summary()
RETURNS TABLE (customers int, paying int, trialing int, lapsed int, comped int,
  mrr_rand int, trials_ending_7d int, signups_30d int, signups_7d int,
  never_set_up int, quiet_14d int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH c AS (SELECT * FROM public.platform_customers()),
       priced AS (SELECT c.*, CASE c.plan WHEN 'starter' THEN 350 WHEN 'growth' THEN 550
                                          WHEN 'pro' THEN 750 ELSE 0 END AS rand FROM c)
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
         count(*) FILTER (WHERE properties > 0 AND (last_seen IS NULL OR last_seen < now() - interval '14 days'))::int
    FROM priced;
$$;

REVOKE ALL ON FUNCTION public.platform_customers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_summary()   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_customers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_summary()   TO authenticated;

-- ══ THE TWO ORPHANS THEMSELVES ════════════════════════════════════
--
-- NOT deleted here. They are excluded from every count above, so they cost
-- nothing, and deleting production rows is the owner's call rather than a
-- migration's — they are the only record that this data model was ever
-- shaped that way. Delete when convenient:
--
--   DELETE FROM public.org_settings   WHERE org_id IN (…);
--   DELETE FROM public.org_subscriptions WHERE org_id IN (…);
--   DELETE FROM public.organizations  WHERE id IN (…);
--
-- Verified empty on 2026-08-02: no profiles, properties, bookings,
-- team_contacts, finance_transactions or domestics reference either.

-- End 905_customer_definition.
