-- 906_platform_actions.sql
-- Runs on BOTH databases.
--
-- Owner: "I need action buttons within info@hosteasepro to comp free access
-- to people who test for me, and just have some useful managing tools
-- available to me."
--
-- ══ WHY THE CONSOLE COULD ONLY LOOK, NOT TOUCH ════════════════════
--
-- 904 gave the platform owner a way to READ across every org, through
-- SECURITY DEFINER functions gated on is_platform_owner(). Writing is a
-- separate problem and was left unsolved: every policy on
-- org_subscriptions is scoped to current_org_id(), so signed into HOSTEASE
-- PRO's own org she can update exactly one subscription — her own. Comping
-- a tester meant opening the SQL editor.
--
-- Same shape as the answer in 904: SECURITY DEFINER, gated, narrow. Five
-- functions that each do one thing, rather than one that takes a table
-- name and a column.
--
-- ══ WHAT THESE DELIBERATELY STILL CANNOT DO ═══════════════════════
--
-- Read a customer's data. Every function below touches org_subscriptions
-- and nothing else — no bookings, no guests, no addresses, no income. The
-- promise 904 made ("an agency evaluating HEP can be told their guests and
-- their revenue are not visible to us") stays true only while that holds,
-- and adding write access is exactly the moment it would quietly stop
-- being true if nobody said so out loud.

-- ══ 1. THE AUDIT TRAIL ════════════════════════════════════════════
--
-- Money is being changed here. Not a compliance exercise — the practical
-- version: six months from now, "why is this agency not being charged"
-- has an answer that is written down rather than remembered.
CREATE TABLE IF NOT EXISTS public.platform_actions (
  id          bigserial PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action      text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor       uuid,
  actor_email text,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_actions_at_idx ON public.platform_actions (at DESC);

-- 880 attaches a "your subscription has lapsed, you cannot write" trigger
-- to EVERY public table carrying an org_id, discovered by loop. This table
-- carries one — it names the customer an action was about — and it must
-- never be gated by that customer's own subscription state. The whole
-- point of the log is to record reactivating a lapsed account, and 880
-- would refuse the write for precisely the orgs that need it most.
DROP TRIGGER IF EXISTS subscription_write_gate ON public.platform_actions;

ALTER TABLE public.platform_actions ENABLE ROW LEVEL SECURITY;

-- Readable by the platform owner, written only by the functions below
-- (which are SECURITY DEFINER and so bypass this). No INSERT policy on
-- purpose: nothing should be able to forge a log entry from a browser.
DROP POLICY IF EXISTS platform_actions_owner_read ON public.platform_actions;
CREATE POLICY platform_actions_owner_read ON public.platform_actions
  FOR SELECT USING (public.is_platform_owner());

REVOKE ALL ON public.platform_actions FROM PUBLIC;
GRANT SELECT ON public.platform_actions TO authenticated;

COMMENT ON TABLE public.platform_actions IS
  'What the platform owner did to a customer''s subscription, and when. Written only by the platform_* functions in 906. Answers "why is this agency not being charged" without anyone having to remember.';

-- ══ 2. THE GUARD EVERY ACTION SHARES ══════════════════════════════
--
-- One function, so five call sites cannot drift apart, and so that adding
-- a sixth action next month cannot accidentally ship without the check.
CREATE OR REPLACE FUNCTION public.platform_guard(p_org uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Not permitted.' USING ERRCODE = '42501';
  END IF;
  IF p_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org) THEN
    RAISE EXCEPTION 'No such organisation.' USING ERRCODE = '22023';
  END IF;
  -- HEP is not its own customer. Comping or lapsing the platform org would
  -- put a nonsense row in her own dashboard and, worse, could gate the
  -- console's own writes behind 880.
  IF p_org = (SELECT platform_org_id FROM public.platform_settings) THEN
    RAISE EXCEPTION 'That is HostEase Pro itself, not a customer.' USING ERRCODE = '22023';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.platform_log(p_org uuid, p_action text, p_detail jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.platform_actions (org_id, action, detail, actor, actor_email)
  SELECT p_org, p_action, COALESCE(p_detail, '{}'::jsonb), auth.uid(),
         (SELECT email::text FROM auth.users WHERE id = auth.uid());
$$;

-- Signup writes a row, but an org created before billing existed may not
-- have one, and every action below is an UPDATE. Make sure there is
-- something to update rather than silently affecting zero rows.
CREATE OR REPLACE FUNCTION public.platform_ensure_sub(p_org uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.org_subscriptions (org_id) VALUES (p_org)
  ON CONFLICT (org_id) DO NOTHING;
$$;

-- ══ 3. COMP AN ACCOUNT ════════════════════════════════════════════
--
-- "People who test for me" — and S&N, which the owner asked to sit in the
-- customer base at no charge so it is exercised by the same code every
-- other agency runs on.
--
-- plan 'founder' + status 'active' is the combination that already means
-- comped everywhere else: platform_summary() counts plan='founder' as
-- comped and excludes it from MRR, and org_can_write() lets status
-- 'active' through, so a comped account keeps working indefinitely with
-- no trial clock. amount_cents is zeroed so nothing later reports a
-- payment that never happened.
CREATE OR REPLACE FUNCTION public.platform_comp_account(p_org uuid, p_note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.platform_guard(p_org);
  PERFORM public.platform_ensure_sub(p_org);
  UPDATE public.org_subscriptions
     SET plan = 'founder', status = 'active',
         trial_ends_at = NULL, amount_cents = 0,
         notes = COALESCE(NULLIF(p_note, ''), notes),
         updated_at = now()
   WHERE org_id = p_org;
  PERFORM public.platform_log(p_org, 'comp', jsonb_build_object('note', p_note));
  RETURN 'comped';
END $$;

-- ══ 4. STOP COMPING ═══════════════════════════════════════════════
--
-- Back onto a normal footing. Defaults to a fresh 7-day trial rather than
-- straight to a paid plan: the person was testing for free, and jumping
-- them to "you owe R550" with no warning is how you lose a friendly user.
CREATE OR REPLACE FUNCTION public.platform_end_comp(p_org uuid, p_trial_days int DEFAULT 7)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.platform_guard(p_org);
  IF p_trial_days < 0 OR p_trial_days > 365 THEN
    RAISE EXCEPTION 'Trial length must be between 0 and 365 days.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.platform_ensure_sub(p_org);
  UPDATE public.org_subscriptions
     SET plan = 'trial', status = 'trialing',
         trial_ends_at = now() + (p_trial_days || ' days')::interval,
         updated_at = now()
   WHERE org_id = p_org;
  PERFORM public.platform_log(p_org, 'end_comp', jsonb_build_object('trial_days', p_trial_days));
  RETURN 'trialing';
END $$;

-- ══ 5. EXTEND A TRIAL ═════════════════════════════════════════════
--
-- The most common thing a founder does, and currently impossible without
-- the SQL editor. Extends from whichever is later — now, or the existing
-- end date — so "give them another week" adds a week to what they have
-- rather than silently shortening a trial that still had ten days left.
CREATE OR REPLACE FUNCTION public.platform_extend_trial(p_org uuid, p_days int)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_new timestamptz;
BEGIN
  PERFORM public.platform_guard(p_org);
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'Extend by between 1 and 365 days.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.platform_ensure_sub(p_org);
  UPDATE public.org_subscriptions
     SET status = 'trialing', plan = CASE WHEN plan = 'founder' THEN 'trial' ELSE plan END,
         trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now()) + (p_days || ' days')::interval,
         updated_at = now()
   WHERE org_id = p_org
   RETURNING trial_ends_at INTO v_new;
  PERFORM public.platform_log(p_org, 'extend_trial', jsonb_build_object('days', p_days, 'until', v_new));
  RETURN v_new;
END $$;

-- ══ 6. SET A PLAN BY HAND ═════════════════════════════════════════
--
-- For a customer who pays by EFT, or whose PayFast subscription needs
-- correcting. Kept explicit about both plan AND status because the two
-- carry different meanings and guessing one from the other is how a
-- cancelled account ends up counted in MRR.
CREATE OR REPLACE FUNCTION public.platform_set_plan(p_org uuid, p_plan text, p_status text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.platform_guard(p_org);
  IF p_plan NOT IN ('starter', 'growth', 'pro', 'trial', 'founder') THEN
    RAISE EXCEPTION 'Unknown plan: %', p_plan USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('trialing', 'active', 'cancelled', 'past_due', 'lapsed') THEN
    RAISE EXCEPTION 'Unknown status: %', p_status USING ERRCODE = '22023';
  END IF;
  PERFORM public.platform_ensure_sub(p_org);
  UPDATE public.org_subscriptions
     SET plan = p_plan, status = p_status,
         -- Leaving a stale trial end date on an account that is now paying
         -- makes the dashboard show "3 days left" next to a live customer.
         trial_ends_at = CASE WHEN p_status = 'trialing' THEN trial_ends_at ELSE NULL END,
         updated_at = now()
   WHERE org_id = p_org;
  PERFORM public.platform_log(p_org, 'set_plan', jsonb_build_object('plan', p_plan, 'status', p_status));
  RETURN p_plan || '/' || p_status;
END $$;

-- ══ 7. A NOTE ON A CUSTOMER ═══════════════════════════════════════
--
-- "Cousin's agency, testing the Airbnb sync." Ordinary CRM memory, and the
-- thing most likely to be needed and least likely to be written down.
CREATE OR REPLACE FUNCTION public.platform_set_note(p_org uuid, p_note text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.platform_guard(p_org);
  PERFORM public.platform_ensure_sub(p_org);
  UPDATE public.org_subscriptions
     SET notes = COALESCE(p_note, ''), updated_at = now()
   WHERE org_id = p_org;
  PERFORM public.platform_log(p_org, 'note', jsonb_build_object('note', left(COALESCE(p_note,''), 200)));
  RETURN COALESCE(p_note, '');
END $$;

-- ══ 8. WHAT HAVE I DONE LATELY ════════════════════════════════════
CREATE OR REPLACE FUNCTION public.platform_recent_actions(p_limit int DEFAULT 20)
RETURNS TABLE (at timestamptz, org_name text, action text, detail jsonb, actor_email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.at, o.name, a.action, a.detail, a.actor_email
    FROM public.platform_actions a
    JOIN public.organizations o ON o.id = a.org_id
   WHERE public.is_platform_owner()
   ORDER BY a.at DESC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 200));
$$;

-- ══ GRANTS ════════════════════════════════════════════════════════
-- Not anon. There is no signed-out way to comp an account.
REVOKE ALL ON FUNCTION public.platform_guard(uuid)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_log(uuid, text, jsonb)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_ensure_sub(uuid)            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_comp_account(uuid, text)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_end_comp(uuid, int)         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_extend_trial(uuid, int)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_set_plan(uuid, text, text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_set_note(uuid, text)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_recent_actions(int)         FROM PUBLIC;

-- platform_guard/log/ensure_sub are internal helpers: the five public
-- actions call them, but nothing should be able to reach them directly
-- from a browser — platform_log especially, since a caller who could
-- reach it could write whatever it liked into the audit trail.
GRANT EXECUTE ON FUNCTION public.platform_comp_account(uuid, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_end_comp(uuid, int)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_extend_trial(uuid, int)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_plan(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_note(uuid, text)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_recent_actions(int)        TO authenticated;

-- ══ 9. THE LIST GAINS THE NOTE ════════════════════════════════════
-- So a note written in the console is visible in the console. Postgres
-- will not replace a function whose OUT parameters changed, and summary
-- selects from customers, so both come down and go back up together.
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
  amount_cents  int,
  note          text
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
         NULLIF(s.notes, '')
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
     -- 905: no login, no customer.
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.org_id = o.id)
   ORDER BY o.created_at DESC;
$$;

COMMENT ON FUNCTION public.platform_customers() IS
  'One row per agency that somebody can actually sign into, plus the owner''s own note about them. Counts only: no bookings, guests, addresses or income.';

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

-- End 906_platform_actions.
