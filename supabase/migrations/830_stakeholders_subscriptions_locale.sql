-- 830_stakeholders_subscriptions_locale.sql
-- Runs on BOTH databases. Three related pieces:
--   1. property_stakeholders — who OWNS a property vs who MANAGES it
--   2. org_subscriptions     — plan, trial, status (HEP as a paid product)
--   3. profiles.locale       — clients pick their own language
--
-- ── 1. STAKEHOLDERS ───────────────────────────────────────────────
-- Until now a property had exactly one relationship: properties.org_id,
-- meaning "the org that manages it". That conflates two different
-- parties. TV House is MANAGED by S&N and OWNED by someone else — and
-- the owner is the person who gets a login and a report.
--
-- Kept separate from property_users on purpose: property_users answers
-- "which login may see this property" (an access-control fact), while
-- this answers "who are the real-world parties" (a commercial fact). The
-- owner exists as a stakeholder from the moment the contract is signed,
-- often before they have ever logged in — email is recorded first and
-- user_id is filled in when they accept the invite.
CREATE TABLE IF NOT EXISTS public.property_stakeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  -- 'owner'  — the person who owns the property (gets the client login)
  -- 'agency' — the business managing it (normally the org itself, but
  --            stated explicitly so a co-managed or transferred property
  --            has a record rather than an assumption)
  party text NOT NULL CHECK (party IN ('owner','agency')),
  display_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  -- Filled once the person actually has a login. NULL means invited or
  -- simply on record.
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- For 'agency' rows: which org manages it. Lets a property be managed
  -- by an org other than the one that owns the record, which is what a
  -- white-label or hand-over arrangement needs.
  agency_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_stakeholders_prop_idx ON public.property_stakeholders (property_id, party);
CREATE INDEX IF NOT EXISTS property_stakeholders_org_idx  ON public.property_stakeholders (org_id);
CREATE INDEX IF NOT EXISTS property_stakeholders_user_idx ON public.property_stakeholders (user_id);
-- One email can only hold one stake in a property once.
CREATE UNIQUE INDEX IF NOT EXISTS property_stakeholders_uniq
  ON public.property_stakeholders (property_id, party, lower(email)) WHERE email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.property_stakeholders_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS property_stakeholders_updated_at ON public.property_stakeholders;
CREATE TRIGGER property_stakeholders_updated_at BEFORE UPDATE ON public.property_stakeholders
  FOR EACH ROW EXECUTE FUNCTION public.property_stakeholders_updated_at();

ALTER TABLE public.property_stakeholders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_stakeholders_admin ON public.property_stakeholders;
CREATE POLICY property_stakeholders_admin ON public.property_stakeholders FOR ALL USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
) WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

-- A client may see their OWN stakeholder row (to confirm what we hold
-- about them) but not the other parties on the property.
DROP POLICY IF EXISTS property_stakeholders_self ON public.property_stakeholders;
CREATE POLICY property_stakeholders_self ON public.property_stakeholders FOR SELECT USING (
  auth.role() = 'authenticated' AND user_id = auth.uid()
);

-- ── 2. SUBSCRIPTIONS ──────────────────────────────────────────────
-- HEP is becoming a product other agencies pay for. Nothing recorded
-- whether an org was trialling, paying or overdue, which is the
-- difference between a tool you run and a product you sell.
--
-- Deliberately NOT a Stripe mirror: this is the state the APP needs to
-- decide what to show. Stripe stays the source of truth for money, and
-- its ids are stored so the two can be reconciled.
CREATE TABLE IF NOT EXISTS public.org_subscriptions (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'trial',
  status text NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing','active','past_due','canceled','expired')),
  -- One week, per the owner's decision. Stored per org rather than
  -- assumed, so a longer trial can be granted to a design partner
  -- without a code change.
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  seats integer,
  properties_limit integer,
  stripe_customer_id text,
  stripe_subscription_id text,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.org_subscriptions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS org_subscriptions_updated_at ON public.org_subscriptions;
CREATE TRIGGER org_subscriptions_updated_at BEFORE UPDATE ON public.org_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.org_subscriptions_updated_at();

ALTER TABLE public.org_subscriptions ENABLE ROW LEVEL SECURITY;

-- Any member may READ their org's subscription (the app shows "5 days of
-- trial left"); only admins may change it. Nobody edits it by hand in
-- practice — Stripe webhooks will — but an admin needs to be able to fix
-- a bad state without database access.
DROP POLICY IF EXISTS org_subscriptions_select ON public.org_subscriptions;
CREATE POLICY org_subscriptions_select ON public.org_subscriptions FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_member(org_id)
);
DROP POLICY IF EXISTS org_subscriptions_write ON public.org_subscriptions;
CREATE POLICY org_subscriptions_write ON public.org_subscriptions FOR ALL USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
) WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

-- Existing orgs are grandfathered as active rather than dropped into a
-- trial that would expire under them.
INSERT INTO public.org_subscriptions (org_id, plan, status, notes)
SELECT o.id, 'founder', 'active', 'Pre-dates subscription billing; grandfathered.'
FROM public.organizations o
ON CONFLICT (org_id) DO NOTHING;

-- ── 3. LOCALE ─────────────────────────────────────────────────────
-- Clients are property owners anywhere in the world — the first one is
-- Czech. They choose their own language; it is not inferred from the
-- browser, because an owner living abroad often prefers their mother
-- tongue over the local one.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en';

COMMENT ON COLUMN public.profiles.locale IS
  'UI language chosen by the user (en, de, pl, es, cs, af...). Set by the user, never inferred from the browser.';

-- End 830_stakeholders_subscriptions_locale.
