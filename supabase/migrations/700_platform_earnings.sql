-- 700_platform_earnings.sql
-- Runs on BOTH databases.
--
-- Turns uploaded platform statements (finance_documents, 640) into REAL
-- income figures. The owner's framing, and the reason this isn't just a
-- nicer document list: "the data should actually be used as real numbers
-- as the other numbers are just averages and guidelines. this is our
-- actual income!" Everything HEP shows about revenue today is derived
-- from bookings — iCal-imported, with estimated/averaged nightly rates.
-- What a platform actually paid out is a different (and authoritative)
-- number, and until now lived only inside PDFs.
--
-- Two tables, because the two example statements have different shapes:
--
--   platform_earnings      — normalized per (document, property, period)
--                            totals. BOTH platforms produce these; this
--                            is what Reports reads.
--   platform_statement_lines — the individual transactions behind them.
--                            LekkeSlaap statements are line-level (one
--                            row per commission/fee/payment/payout, keyed
--                            by booking reference); Airbnb's earnings
--                            report is summary-only, so it produces
--                            earnings rows with no lines. Kept for
--                            drill-down and as an audit trail: the stored
--                            totals can always be traced back to the
--                            lines they came from.
--
-- ACCOUNTING NOTE, important and easy to get wrong: a "Payout" line is
-- NOT income. It is the transfer of already-earned money from the
-- platform's balance to the bank, so counting payouts as earnings would
-- double-count every rand. Income is the guest payments; commission and
-- payment-handling fees are what the platform keeps. Hence:
--     net_earnings = gross_earnings - commission - fees + adjustments
-- with payouts deliberately excluded from all four, and tracked
-- separately (payouts_total) only so a statement's closing balance can be
-- reconciled. This mirrors how both example statements actually add up.
--
-- gross/commission/fees are stored as positive magnitudes regardless of
-- the sign the statement printed them with (LekkeSlaap prints deductions
-- negative, Airbnb prints service fees negative in one column and totals
-- net in another) — a single convention here means Reports never has to
-- know which platform a row came from.
--
-- Deleting a document removes its extracted figures (ON DELETE CASCADE):
-- re-uploading a corrected statement should not leave the old numbers
-- silently double-counted in Reports.
--
-- Admin-only RLS, same posture as finance_documents (640) and
-- business_vault (540) — this is financial record data.

CREATE TABLE IF NOT EXISTS public.platform_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.finance_documents(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('airbnb','lekkeslaap','booking','other')),
  -- Short property key ('speranta'/'tvhouse') or NULL when a statement
  -- covers a property we could not map automatically — the review step
  -- in the UI makes the user resolve it before saving, but NULL stays
  -- legal so a partially-mapped statement is still storable.
  property_id text,
  period_start date,
  period_end date,
  currency text NOT NULL DEFAULT 'ZAR',
  gross_earnings numeric(12,2) NOT NULL DEFAULT 0,
  commission numeric(12,2) NOT NULL DEFAULT 0,
  fees numeric(12,2) NOT NULL DEFAULT 0,
  adjustments numeric(12,2) NOT NULL DEFAULT 0,
  tax_withheld numeric(12,2) NOT NULL DEFAULT 0,
  net_earnings numeric(12,2) NOT NULL DEFAULT 0,
  payouts_total numeric(12,2) NOT NULL DEFAULT 0,
  closing_balance numeric(12,2),
  nights_booked integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_earnings_org_idx ON public.platform_earnings (org_id);
CREATE INDEX IF NOT EXISTS platform_earnings_doc_idx ON public.platform_earnings (document_id);
CREATE INDEX IF NOT EXISTS platform_earnings_period_idx ON public.platform_earnings (org_id, period_start, period_end);

CREATE TABLE IF NOT EXISTS public.platform_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.finance_documents(id) ON DELETE CASCADE,
  platform text NOT NULL,
  property_id text,
  booking_reference text,
  txn_date date,
  description text NOT NULL DEFAULT '',
  -- Normalized bucket the parser assigned. 'other' is deliberate: an
  -- unrecognized description is kept verbatim rather than dropped or
  -- forced into a bucket, so nothing silently vanishes from the audit
  -- trail and unknown line types surface in review.
  line_type text NOT NULL DEFAULT 'other'
    CHECK (line_type IN ('guest_payment','commission','fee','payout','adjustment','refund','balance','other')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  balance numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_statement_lines_org_idx ON public.platform_statement_lines (org_id);
CREATE INDEX IF NOT EXISTS platform_statement_lines_doc_idx ON public.platform_statement_lines (document_id);
CREATE INDEX IF NOT EXISTS platform_statement_lines_ref_idx ON public.platform_statement_lines (org_id, booking_reference);

-- Extraction bookkeeping on the document itself, so the Documents list
-- can show what was read out of each file without joining.
ALTER TABLE public.finance_documents
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'none'
    CHECK (extraction_status IN ('none','extracted','manual','failed'));

-- Listing-name -> property mapping. A statement identifies a property by
-- its platform listing name ("Calm Blouberg Beach Apt - Gated & Lift
-- Access" on Airbnb, "Calm Apartment" on LekkeSlaap) which matches
-- neither our property name nor each other. Seeded here from the real
-- example statements and stored as DATA, not a lookup table in the
-- client (Roadmap p2-18) — reusing properties.platform_integrations
-- rather than adding a column, since that jsonb exists for exactly this.
-- The Documents review step also writes back any name the user maps by
-- hand, so the mapping learns instead of needing a migration each time.
UPDATE public.properties
SET platform_integrations = COALESCE(platform_integrations, '{}'::jsonb)
  || jsonb_build_object('listing_names', jsonb_build_array('Calm Blouberg Beach Apt - Gated & Lift Access', 'Calm Apartment'))
WHERE id = 'e9737638-d83a-4947-940a-8746789e4d9f'
  AND COALESCE(platform_integrations->'listing_names', 'null'::jsonb) = 'null'::jsonb;

UPDATE public.properties
SET platform_integrations = COALESCE(platform_integrations, '{}'::jsonb)
  || jsonb_build_object('listing_names', jsonb_build_array('TV House'))
WHERE id = '83b2a84a-5451-4be5-a84f-2efc0d2602d5'
  AND COALESCE(platform_integrations->'listing_names', 'null'::jsonb) = 'null'::jsonb;

ALTER TABLE public.platform_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_statement_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_earnings_select ON public.platform_earnings;
CREATE POLICY platform_earnings_select ON public.platform_earnings FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS platform_earnings_insert ON public.platform_earnings;
CREATE POLICY platform_earnings_insert ON public.platform_earnings FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS platform_earnings_update ON public.platform_earnings;
CREATE POLICY platform_earnings_update ON public.platform_earnings FOR UPDATE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
) WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS platform_earnings_delete ON public.platform_earnings;
CREATE POLICY platform_earnings_delete ON public.platform_earnings FOR DELETE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS platform_statement_lines_select ON public.platform_statement_lines;
CREATE POLICY platform_statement_lines_select ON public.platform_statement_lines FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS platform_statement_lines_insert ON public.platform_statement_lines;
CREATE POLICY platform_statement_lines_insert ON public.platform_statement_lines FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS platform_statement_lines_delete ON public.platform_statement_lines;
CREATE POLICY platform_statement_lines_delete ON public.platform_statement_lines FOR DELETE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

-- End 700_platform_earnings.
