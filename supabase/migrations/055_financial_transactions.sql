-- 055_financial_transactions.sql
-- Create financial_transactions table (required for financial_monthly_summary view).
-- Simplified: avoid DO block (was causing syntax error in SQL editor). Uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  booking_id bigint REFERENCES public.bookings(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  txn_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(12,2) NOT NULL CHECK (amount <> 0),
  currency text NOT NULL DEFAULT 'EUR',
  direction text NOT NULL CHECK (direction IN ('income','expense')),
  method text CHECK (method IN ('bank_transfer','cash','card','online','other')),
  category text NOT NULL CHECK (category IN (
    'accommodation','cleaning_fee','service_fee','commission','maintenance','utilities','supplies','tax','other'
  )),
  description text,
  notes text,
  external_ref text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  search_text text GENERATED ALWAYS AS (
    lower(coalesce(description,'') || ' ' || coalesce(notes,'') || ' ' || coalesce(category,'') || ' ' || coalesce(external_ref,''))
  ) STORED
);

-- Indexes (use IF NOT EXISTS where supported; Postgres 15 supports it)
CREATE INDEX IF NOT EXISTS financial_transactions_org_date_idx ON public.financial_transactions (org_id, txn_date);
CREATE INDEX IF NOT EXISTS financial_transactions_direction_idx ON public.financial_transactions (direction);
CREATE INDEX IF NOT EXISTS financial_transactions_category_idx ON public.financial_transactions (category);

-- Enable RLS
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

-- Recreate policies safely (drop then create to avoid duplicate name errors)
DROP POLICY IF EXISTS select_financial_transactions ON public.financial_transactions;
CREATE POLICY select_financial_transactions ON public.financial_transactions
  FOR SELECT USING ( org_id = current_setting('request.jwt.claim.org_id', true)::uuid );

DROP POLICY IF EXISTS modify_financial_transactions ON public.financial_transactions;
CREATE POLICY modify_financial_transactions ON public.financial_transactions
  FOR ALL USING ( org_id = current_setting('request.jwt.claim.org_id', true)::uuid )
  WITH CHECK ( org_id = current_setting('request.jwt.claim.org_id', true)::uuid );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.financial_transactions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS financial_transactions_updated_at ON public.financial_transactions;
CREATE TRIGGER financial_transactions_updated_at
  BEFORE UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.financial_transactions_updated_at();

-- Optional sample data (commented out):
-- INSERT INTO public.financial_transactions (org_id, amount, direction, category, description)
-- SELECT o.id, 1500, 'income', 'accommodation', 'Sample booking income'
-- FROM public.organizations o LIMIT 1;
-- INSERT INTO public.financial_transactions (org_id, amount, direction, category, description)
-- SELECT o.id, -300, 'expense', 'cleaning_fee', 'Sample cleaning expense'
-- FROM public.organizations o LIMIT 1;

-- End of financial_transactions creation.
