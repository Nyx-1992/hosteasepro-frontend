-- 740_pricing_plans.sql
-- Runs on BOTH databases.
--
-- The management-service price list: what S&N charges an owner to manage
-- their property. Seeded with the tiers agreed in the pricing discussion
-- (2026-07-30) so the numbers live somewhere real instead of only in a
-- chat log.
--
-- WHY TURNOVERS ARE A COLUMN, not a note. The business charges a FIXED
-- monthly fee rather than a percentage — the owner's explicit call
-- ("we don't think it's fair to take from the profit but just want a
-- fixed income every month"). The one genuine flaw in fixed pricing is
-- that workload scales with turnovers while income doesn't: a flat with
-- three long bookings a month is a fraction of the work of the same flat
-- with ten weekend stays, but pays identically. Including a turnover
-- allowance per tier, with a per-turnover fee beyond it, is what makes a
-- flat fee safe rather than thin. Storing it as data (rather than prose
-- in a contract nobody tracks) is what makes it billable: HEP already
-- counts turnovers from bookings, and the Management Invoice (p0-32)
-- already computes per property per month, so overage can be charged
-- automatically instead of quietly becoming free work.
--
-- Amounts are ex-VAT. Roadmap p1-6 (confirm VAT status) is still open,
-- and compulsory SA registration at R1m turnover is reachable once
-- several properties are under management — quoting ex-VAT from the
-- start avoids repricing clients later.
--
-- Admin-only RLS: this is commercial pricing, not operational data.

CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  property_type text NOT NULL DEFAULT '',
  monthly_fee numeric(12,2) NOT NULL DEFAULT 0,
  -- Turnovers covered by the monthly fee, and what each one beyond it
  -- costs. NULL included_turnovers means unlimited (a plan sold without
  -- an allowance) rather than zero, which would mean every turnover is
  -- chargeable — an expensive difference to get wrong.
  included_turnovers integer,
  extra_turnover_fee numeric(12,2) NOT NULL DEFAULT 0,
  setup_fee numeric(12,2) NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_plans_org_idx ON public.pricing_plans (org_id, active, sort_order);

CREATE OR REPLACE FUNCTION public.pricing_plans_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS pricing_plans_updated_at ON public.pricing_plans;
CREATE TRIGGER pricing_plans_updated_at
  BEFORE UPDATE ON public.pricing_plans
  FOR EACH ROW EXECUTE FUNCTION public.pricing_plans_updated_at();

ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pricing_plans_select ON public.pricing_plans;
CREATE POLICY pricing_plans_select ON public.pricing_plans FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);
DROP POLICY IF EXISTS pricing_plans_insert ON public.pricing_plans;
CREATE POLICY pricing_plans_insert ON public.pricing_plans FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);
DROP POLICY IF EXISTS pricing_plans_update ON public.pricing_plans;
CREATE POLICY pricing_plans_update ON public.pricing_plans FOR UPDATE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
) WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);
DROP POLICY IF EXISTS pricing_plans_delete ON public.pricing_plans;
CREATE POLICY pricing_plans_delete ON public.pricing_plans FOR DELETE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

-- Link a budget income line to the plan it is billed under, so the
-- expected monthly figure and the price list can't drift apart.
ALTER TABLE public.business_budget
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.pricing_plans(id) ON DELETE SET NULL;

-- The agreed tiers. Villa is seeded at the bottom of its R7,500–8,500
-- range: a floor is safer to quote from than a ceiling.
--
-- NOTE ON THE VILLA TIER: TV House works at R6,000 because its caretaker
-- costs nothing in cash (paid in accommodation, and he pays R500/month
-- electricity back to the property owners). That does NOT replicate — a
-- client's villa would need a caretaker S&N actually pays, so on-site
-- presence is priced as an add-on rather than assumed included.
INSERT INTO public.pricing_plans
  (org_id, name, property_type, monthly_fee, included_turnovers, extra_turnover_fee, setup_fee, description, notes, sort_order)
SELECT * FROM (VALUES
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4'::uuid, 'Apartment', '1–2 bed, no garden or pool', 3500::numeric, 8, 200::numeric, 3500::numeric,
   'Listing management across platforms, calendar and pricing, guest communication, turnover scheduling, monthly owner statement and dashboard access.',
   'Priced above the R3,000 instinct on purpose: per-client overhead (statements, being on call, platform admin) barely shrinks with property size, so R3,000 is close to cost recovery at 8 turnovers.', 10),
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4'::uuid, 'House', '2–4 bed, garden, small pool', 5500::numeric, 10, 200::numeric, 4000::numeric,
   'Everything in Apartment, plus maintenance coordination, contractor management, inventory restocking and inspections.',
   'Repairs are COORDINATED, not paid for — parts and contractors are billed to the owner. One burst geyser at R8,000–15,000 would otherwise erase two months of fee.', 20),
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4'::uuid, 'Villa / Estate', 'Large home, pool, garden', 7500::numeric, 12, 250::numeric, 5000::numeric,
   'Everything in House, plus pool and garden service coordination and priority response.',
   'Range is R7,500–8,500 depending on size. On-site caretaking is NOT included — TV House''s caretaker is free only because he is paid in accommodation, which will not be true for a client property.', 30)
) AS v(org_id, name, property_type, monthly_fee, included_turnovers, extra_turnover_fee, setup_fee, description, notes, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricing_plans WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4'
);

-- End 740_pricing_plans.
