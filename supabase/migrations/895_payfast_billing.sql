-- 895_payfast_billing.sql
-- Runs on BOTH databases.
--
-- The first mechanism that can actually charge a customer (p2-2).
--
-- NOT STRIPE. 830 put stripe_customer_id and stripe_subscription_id on
-- org_subscriptions, and p2-2 has said "Stripe subscription billing"
-- since the beginning. Stripe is not generally available to South
-- African businesses, so that plan could not have shipped as written.
-- PayFast does recurring billing, settles into a South African bank
-- account, and there is already an account in flight for the booking
-- site (now-4). The Stripe columns stay — they cost nothing and a
-- second market may want them — but PayFast is what runs.
--
-- ══ 1. WHAT PAYFAST NEEDS US TO REMEMBER ══════════════════════════
ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS payfast_token       text;
ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS payfast_payment_id  text;
ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS amount_cents        integer;
ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS last_payment_at     timestamptz;

COMMENT ON COLUMN public.org_subscriptions.payfast_token IS
  'PayFast subscription token. This is the handle used to pause, cancel or query the subscription through their API — losing it means the subscription can only be managed from their dashboard.';
COMMENT ON COLUMN public.org_subscriptions.payfast_payment_id IS
  'Our own m_payment_id for the subscription''s first payment. Sent to PayFast and echoed back on every ITN, which is how an ITN is matched to an org.';
COMMENT ON COLUMN public.org_subscriptions.amount_cents IS
  'What this org is actually being charged, in cents. Stored rather than derived from the plan name, because a price change must not silently re-price existing customers.';

-- One row per notification PayFast sends us, kept whether or not it was
-- accepted. A rejected ITN is the more interesting one: it is either a
-- forgery attempt or our own validation being wrong, and neither is
-- diagnosable after the fact without the raw payload.
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  provider     text NOT NULL DEFAULT 'payfast',
  event_type   text,
  payment_id   text,
  amount_cents integer,
  accepted     boolean NOT NULL DEFAULT false,
  reason       text,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_events_org_idx ON public.subscription_events (org_id, created_at DESC);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- Nobody reads this from a browser. It is written by the ITN endpoint
-- with the service role, which bypasses RLS, and read by us in SQL when
-- something needs explaining. Owners see their payment history through
-- org_subscriptions, which is theirs already.
DROP POLICY IF EXISTS subscription_events_owner_read ON public.subscription_events;
CREATE POLICY subscription_events_owner_read ON public.subscription_events FOR SELECT USING (
  auth.role() = 'authenticated'
  AND org_id = public.current_org_id()
  AND EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'owner' AND p.org_id = subscription_events.org_id)
);
GRANT SELECT ON public.subscription_events TO authenticated;

-- ══ 2. DO NOT LOCK PEOPLE OUT BEFORE YOU CAN TAKE THEIR MONEY ═════
--
-- Signup has been open on production since the marketing page shipped,
-- and the trial is one week. The merchant account is weeks away — it
-- waits on a bank account, which waits on a court date. So every org
-- that signs up between now and then reaches the end of its trial, gets
-- dropped into read-only by 880's write gate, and finds no way to pay.
--
-- That is the worst possible first impression, and it is entirely our
-- problem rather than theirs. This flag says so out loud: while billing
-- is not live, the write gate does not bite. Flip it the day the
-- merchant account clears and enforcement resumes for everyone.
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  billing_live boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_settings (id, billing_live) VALUES (true, false)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Readable by anyone signed in, because the app needs to know whether to
-- offer a Pay button or an explanation. Writable by nobody from a
-- browser: this is a platform-wide switch, not an org setting, and an
-- org that could flip it would be turning off its own billing.
DROP POLICY IF EXISTS platform_settings_read ON public.platform_settings;
CREATE POLICY platform_settings_read ON public.platform_settings FOR SELECT
  USING (auth.role() IN ('authenticated', 'anon'));
GRANT SELECT ON public.platform_settings TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.billing_is_live()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT billing_live FROM public.platform_settings WHERE id), false);
$$;
GRANT EXECUTE ON FUNCTION public.billing_is_live() TO anon, authenticated;

-- ══ 3. THE GATE, WITH THAT ONE EXTRA REASON TO SAY YES ════════════
-- Otherwise unchanged from 880, including the deliberate fail-open on a
-- missing row.
CREATE OR REPLACE FUNCTION public.org_can_write(org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT
    -- Nobody can pay yet, so nobody gets locked out yet.
    NOT public.billing_is_live()
    OR COALESCE(
    (SELECT s.status IN ('trialing', 'active')
              AND (s.status <> 'trialing'
                   OR s.trial_ends_at IS NULL
                   OR s.trial_ends_at > now())
       FROM public.org_subscriptions s
      WHERE s.org_id = org),
    true);
$$;

COMMENT ON FUNCTION public.org_can_write(uuid) IS
  'False once a subscription is past_due/canceled/expired, or a trial has run out — but always true while platform_settings.billing_live is false, because locking someone out before they can pay is our failure, not theirs. Gates WRITES only; a lapsed org keeps full read access on purpose.';

REVOKE ALL ON FUNCTION public.org_can_write(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.org_can_write(uuid) TO anon, authenticated;

-- End 895_payfast_billing.
