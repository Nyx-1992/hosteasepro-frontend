-- 880_subscription_write_gate.sql
-- Runs on BOTH databases.
--
-- Makes a lapsed subscription mean something, without locking anyone out.
--
-- ── THE OWNER'S RULE ──────────────────────────────────────────────
-- "Lapsed account needs definitely limited view, but not lock out."
--
-- Locking someone out of their own operational data makes them hostile
-- and makes paying again feel like a ransom. Leaving it readable makes
-- coming back easy. So the line is READ EVERYTHING, WRITE NOTHING: the
-- business keeps running on what is already there, but any NEW work
-- needs a live subscription.
--
-- ── WHY TRIGGERS AND NOT RLS ──────────────────────────────────────
-- The obvious move is to AND a subscription check into the existing
-- policies, the way 824 added is_org_member. It is wrong here.
--
-- Most of these policies are FOR ALL, and a FOR ALL policy's USING
-- clause governs SELECT as well as UPDATE and DELETE. Adding the check
-- there would take READ away too — the exact opposite of the rule above.
-- Restricting only WITH CHECK does not work either, because WITH CHECK
-- is not consulted for DELETE.
--
-- A BEFORE INSERT/UPDATE/DELETE trigger cannot make that mistake: it
-- runs on writes and only writes, so "read everything" holds by
-- construction rather than by careful policy authorship.

-- ── Can this org write? ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.org_can_write(org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT s.status IN ('trialing', 'active')
              -- A trial that has run out is not a live trial, whatever
              -- the status column still says. Checking the date here
              -- means nothing has to sweep the table on a timer.
              AND (s.status <> 'trialing'
                   OR s.trial_ends_at IS NULL
                   OR s.trial_ends_at > now())
       FROM public.org_subscriptions s
      WHERE s.org_id = org),
    -- No subscription row at all: allow. Fail-open is deliberate. A
    -- missing row means "nobody has billed this org yet", and the cost
    -- of getting that wrong in the other direction is bricking a paying
    -- customer over a data gap. Signup always writes a row, so this is
    -- a safety net rather than a loophole.
    true);
$$;

COMMENT ON FUNCTION public.org_can_write(uuid) IS
  'False once a subscription is past_due/canceled/expired, or a trial has run out. Gates WRITES only — a lapsed org keeps full read access on purpose.';

REVOKE ALL ON FUNCTION public.org_can_write(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.org_can_write(uuid) TO anon, authenticated;

-- ── The gate ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_subscription_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  -- Server-side callers (our own API endpoints, and any future Stripe
  -- webhook) use the service role and must never be gated — the webhook
  -- that REACTIVATES a lapsed org would otherwise be blocked by the
  -- lapse it is trying to clear.
  IF COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
     OR auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_org := COALESCE(
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE (to_jsonb(NEW) ->> 'org_id')::uuid END,
    (to_jsonb(OLD) ->> 'org_id')::uuid);

  IF v_org IS NOT NULL AND NOT public.org_can_write(v_org) THEN
    RAISE EXCEPTION 'Your HostEase Pro subscription has lapsed. Your data is still here and readable — reactivate to make changes again.'
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

-- ── Attach to the operational tables ──────────────────────────────
-- Every table with an org_id, minus the ones that must stay writable
-- for an org to dig itself out:
--   org_subscriptions — resubscribing is a write
--   org_settings      — fixing billing details is a write
--   profiles          — an owner must still be able to sign in and be
--                       themselves; blocking profile writes on a lapse
--                       risks locking the account rather than limiting it
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'org_id'
       AND t.table_type = 'BASE TABLE'
       AND c.table_name NOT IN ('org_subscriptions', 'org_settings', 'profiles', 'organizations', 'user_profiles')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS subscription_write_gate ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER subscription_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_write()', r.table_name);
  END LOOP;
END $$;

-- Existing orgs are all 'founder'/'active' (830), so nothing changes for
-- anyone today. This only starts biting when a real trial expires.

-- End 880_subscription_write_gate.
