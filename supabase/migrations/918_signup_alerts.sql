-- 918_signup_alerts.sql
-- Runs on BOTH databases.
--
-- Owner: "I am missing that I am not being informed if there is a new
-- customer! I am scared someone finds the website and tries it out and I
-- never realise it without logging into the platform."
--
-- ══ SHE IS RIGHT, AND IT IS WORSE THAN SHE THINKS ════════════════
--
-- api/signup.js creates the org, the login, the trial and the settings
-- row, then sends a welcome email TO THE CUSTOMER. Nothing goes to her.
-- Signup has been open since the marketing page shipped, so the only way
-- to discover a new agency has ever been to open HQ and look.
--
-- A trial is seven days. Miss the first three and more than half of it is
-- gone before anyone says hello — on the one customer who arrived by
-- themselves, which is the most valuable kind at this stage.
--
-- ══ WHY A TABLE AND NOT JUST AN EMAIL ════════════════════════════
--
-- An email that fails is indistinguishable from a quiet week. Resend can
-- be down, the key can be missing, the domain can be unverified, the
-- message can land in spam — and every one of those looks exactly like
-- "nobody signed up", which is the state she is afraid of being wrong
-- about.
--
-- So the alert is RECORDED, not just sent. Two things follow:
--   1. A daily sweep can find any signup with no alert row and send it,
--      so a failed send is caught within a day rather than never.
--   2. HQ can show what was never delivered, which is the fallback that
--      needs no mail provider at all.
--
-- Claim-then-send, the same shape as trial_reminders in 907: the row is
-- written BEFORE the email goes out, so a retry after a crash cannot send
-- twice. Duplicate silence is a bug; duplicate emails are a nuisance —
-- but the failure that matters here is the double-send at 3am when a
-- serverless function is retried, so claiming first is right.

CREATE TABLE IF NOT EXISTS public.platform_alerts (
  kind    text        NOT NULL,          -- 'signup', later: 'cancellation', ...
  ref     text        NOT NULL,          -- the org id, as text
  sent_at timestamptz NOT NULL DEFAULT now(),
  ok      boolean     NOT NULL DEFAULT true,
  detail  text,
  PRIMARY KEY (kind, ref)
);

COMMENT ON TABLE public.platform_alerts IS
  'One row per alert the platform owner has been sent. Exists so a failed email is visible as a missing row rather than as a quiet week — see the daily sweep in api/cron/trial-reminders.js.';

-- Platform-wide, so no org_id and no tenant policy: RLS on, no policy at
-- all, which denies every browser. Only the service key reaches it.
ALTER TABLE public.platform_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_alerts FROM anon, authenticated;

-- ── Claim an alert ────────────────────────────────────────────────
--
-- Returns true only for the caller that inserted the row. A second caller
-- for the same (kind, ref) gets false and must not send.
CREATE OR REPLACE FUNCTION public.claim_platform_alert(p_kind text, p_ref text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.platform_alerts (kind, ref) VALUES (p_kind, p_ref)
  ON CONFLICT (kind, ref) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END $$;

REVOKE ALL ON FUNCTION public.claim_platform_alert(text, text) FROM PUBLIC, anon, authenticated;

-- Record how it actually went, so "sent" and "sent successfully" are not
-- the same claim. A row with ok = false is the one HQ should shout about.
CREATE OR REPLACE FUNCTION public.mark_platform_alert(p_kind text, p_ref text, p_ok boolean, p_detail text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.platform_alerts
     SET ok = p_ok, detail = left(COALESCE(p_detail, ''), 400)
   WHERE kind = p_kind AND ref = p_ref;
$$;

REVOKE ALL ON FUNCTION public.mark_platform_alert(text, text, boolean, text) FROM PUBLIC, anon, authenticated;

-- ── Who signed up and was never announced ─────────────────────────
--
-- The safety net. Any org created in the window with no successful signup
-- alert against it. Deliberately NOT limited to the last 24 hours by
-- default: if the mailer was broken for a week, a 24-hour window would
-- keep every one of those signups invisible forever, which is the exact
-- failure this exists to prevent.
CREATE OR REPLACE FUNCTION public.signups_needing_alert(p_days int DEFAULT 30)
RETURNS TABLE (org_id uuid, org_name text, created_at timestamptz,
               owner_email text, owner_name text, trial_ends_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp, auth AS $$
  SELECT o.id, o.name, o.created_at,
         u.email::text, p.name, s.trial_ends_at
    FROM public.organizations o
    LEFT JOIN public.profiles p ON p.org_id = o.id AND p.role = 'owner'
    LEFT JOIN auth.users u ON u.id = p.id
    LEFT JOIN public.org_subscriptions s ON s.org_id = o.id
   WHERE o.created_at > now() - make_interval(days => p_days)
     AND NOT EXISTS (
       SELECT 1 FROM public.platform_alerts a
        WHERE a.kind = 'signup' AND a.ref = o.id::text AND a.ok
     )
   ORDER BY o.created_at;
$$;

REVOKE ALL ON FUNCTION public.signups_needing_alert(int) FROM PUBLIC, anon, authenticated;

-- ── What HQ shows when the email never arrived ────────────────────
--
-- The fallback that needs no mail provider. Gated on is_platform_owner()
-- like everything else on that screen.
CREATE OR REPLACE FUNCTION public.platform_alert_health()
RETURNS TABLE (unannounced int, failed int, last_sent timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT
    (SELECT count(*)::int FROM public.signups_needing_alert(30)),
    (SELECT count(*)::int FROM public.platform_alerts WHERE NOT ok),
    (SELECT max(sent_at)  FROM public.platform_alerts WHERE ok)
  WHERE public.is_platform_owner();
$$;

REVOKE ALL ON FUNCTION public.platform_alert_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_alert_health() TO authenticated;

-- ══ EXISTING ORGS ARE MARKED AS ALREADY KNOWN ════════════════════
--
-- Without this the first sweep would email an alert for every agency that
-- ever signed up, including S&N itself and the test accounts. The point is
-- to hear about the NEXT one.
INSERT INTO public.platform_alerts (kind, ref, sent_at, ok, detail)
SELECT 'signup', id::text, created_at, true, 'Pre-existing at 918; not announced because it was already known.'
  FROM public.organizations
ON CONFLICT (kind, ref) DO NOTHING;

-- End 918_signup_alerts.
