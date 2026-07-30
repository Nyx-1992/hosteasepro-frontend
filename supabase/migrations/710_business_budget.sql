-- 710_business_budget.sql
-- Runs on BOTH databases.
--
-- Budgeting for the business itself, living under the existing "Business
-- Info" tab (540_business_vault.sql). That tab holds static records —
-- bank details, tax numbers, policies. This adds the moving part: what
-- the business expects to earn and spend each month.
--
-- The trigger for it is the management-company direction: S&N charges a
-- FIXED monthly fee per managed property rather than a cut of revenue
-- (the owner's call — "we don't think it's fair to take from the profit
-- but just want a fixed income every month"). A fixed-fee business lives
-- or dies on knowing its recurring position, which is exactly what a
-- percentage-of-revenue business gets for free.
--
-- Design notes:
--
--   * Lines are RECURRING by nature, with a frequency. A once-off is
--     modelled as frequency 'once' and simply excluded from the monthly
--     rollup — it would otherwise silently inflate every month.
--   * monthly_amount is computed, not stored, so a quarterly or annual
--     line can never drift out of sync with its own normalisation. All
--     rollups in the UI read this column.
--   * direction is explicit rather than inferred from a positive or
--     negative amount: an expense of -R500 and an income of R500 are
--     easy to transpose when typing, and a sign error silently doubles
--     the apparent profit. Amounts are always entered as magnitudes.
--   * property_id is the short key ('speranta'/'tvhouse'), nullable —
--     most business costs (software, accounting, marketing) belong to no
--     single property, and management-fee income belongs to exactly one.
--   * Admin-only for read AND write, matching business_vault: this is
--     the company's own P&L shape, not operational data.
--
-- Deliberately NOT an accounting ledger. No double entry, no reconcili-
-- ation against bank feeds. It answers "what should a normal month look
-- like, and are we above or below it" — the question the owner actually
-- asked. Actuals already live elsewhere (platform_earnings from 700,
-- invoices, domestics) and the UI shows recorded income beside the
-- budget rather than pretending to reconcile the two.

CREATE TABLE IF NOT EXISTS public.business_budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('income','cost')),
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('management_fee','rental','website','cleaning','maintenance','staff','software','marketing','accounting','insurance','other')),
  label text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('monthly','quarterly','annual','once')),
  -- Normalised to a per-month figure so every rollup compares like with
  -- like. 'once' contributes 0 — it is a real planned amount, but not a
  -- recurring one, and counting it monthly would overstate the run rate.
  monthly_amount numeric(12,2) GENERATED ALWAYS AS (
    CASE frequency
      WHEN 'monthly'   THEN amount
      WHEN 'quarterly' THEN amount / 3
      WHEN 'annual'    THEN amount / 12
      ELSE 0
    END
  ) STORED,
  property_id text,
  notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  starts_on date,
  ends_on date,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_budget_org_idx ON public.business_budget (org_id);
CREATE INDEX IF NOT EXISTS business_budget_active_idx ON public.business_budget (org_id, active, direction);

CREATE OR REPLACE FUNCTION public.business_budget_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_budget_updated_at ON public.business_budget;
CREATE TRIGGER business_budget_updated_at
  BEFORE UPDATE ON public.business_budget
  FOR EACH ROW EXECUTE FUNCTION public.business_budget_updated_at();

ALTER TABLE public.business_budget ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_budget_select ON public.business_budget;
CREATE POLICY business_budget_select ON public.business_budget FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS business_budget_insert ON public.business_budget;
CREATE POLICY business_budget_insert ON public.business_budget FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS business_budget_update ON public.business_budget;
CREATE POLICY business_budget_update ON public.business_budget FOR UPDATE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
) WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS business_budget_delete ON public.business_budget;
CREATE POLICY business_budget_delete ON public.business_budget FOR DELETE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

-- Seeded with the arrangements already known to be real from the app's
-- own data, so the tab isn't empty on first open: the TV House
-- management fee (R6,000/month, the figure the Management Invoice
-- already defaults to — see roadmap p0-32). Nothing else is seeded,
-- because nothing else is known; the owner adds their own lines.
--
-- Note the caretaker is deliberately NOT a cost line. Tino is
-- compensated with accommodation and pays R500/month toward electricity
-- back to the property owners, so no cash leaves the management
-- business for him. That is specific to TV House and must not be
-- assumed when pricing other clients' properties.
INSERT INTO public.business_budget (org_id, direction, category, label, amount, frequency, property_id, notes, sort_order)
SELECT '5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'income', 'management_fee',
       'TV House — management fee', 6000, 'monthly', 'tvhouse',
       'Fixed monthly fee. Caretaker costs nothing in cash (paid in accommodation) — do not assume this holds for other clients.', 10
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_budget
  WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND label = 'TV House — management fee'
);

-- End 710_business_budget.
