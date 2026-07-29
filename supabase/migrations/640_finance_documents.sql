-- 640_finance_documents.sql
-- Runs on BOTH databases.
--
-- Backs a new "Documents" area under Invoices — a place to upload/store
-- scanned invoices and booking-platform statements (Airbnb/Booking.com/
-- LekkeSlaap payout statements etc.) for the record. Deliberately store-
-- only for now: no automatic data extraction from the file. The owner
-- flagged wanting extraction (especially for platform statements) as a
-- likely next step once she's provided real example files to scope
-- against — this table's shape may need revisiting then, but starting
-- minimal rather than guessing at fields nothing reads yet.
--
-- Same admin-only read/write posture as business_vault (540) — financial
-- records, not day-to-day operational data.

CREATE TABLE IF NOT EXISTS public.finance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'other' CHECK (doc_type IN ('invoice','statement','other')),
  property_id text,
  doc_date date,
  description text NOT NULL DEFAULT '',
  file_path text NOT NULL,
  file_name text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_documents_org_id_idx ON public.finance_documents (org_id);

ALTER TABLE public.finance_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_documents_select ON public.finance_documents;
CREATE POLICY finance_documents_select ON public.finance_documents FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS finance_documents_insert ON public.finance_documents;
CREATE POLICY finance_documents_insert ON public.finance_documents FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS finance_documents_delete ON public.finance_documents;
CREATE POLICY finance_documents_delete ON public.finance_documents FOR DELETE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

-- End 640_finance_documents.
