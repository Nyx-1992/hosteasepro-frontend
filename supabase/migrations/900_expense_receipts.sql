-- 900_expense_receipts.sql
-- Runs on BOTH databases.
--
-- Silja's ask: "is it possible to get the slips monthly which we prep for
-- the owner's invoice, collected somewhere — e.g. what Nina spends on the
-- TV House or Speranta."
--
-- Most of it already exists and nobody had joined it up. finance_
-- transactions has recorded per-property spend since October 2024 —
-- cleaning, maintenance, gardener, electricity, levies, wifi, rates,
-- 213 rows of it. finance_documents stores files against a property. The
-- two have never referenced each other, and doc_type has only ever held
-- 'statement'. So the numbers are in one list, the slips are in a
-- WhatsApp thread, and the monthly reconciliation is done by memory.
--
-- ══ 1. A SLIP BELONGS TO A SPEND ══════════════════════════════════
-- On the document rather than the transaction, because one purchase can
-- produce several photos — a till slip and the card receipt, or two
-- pages — and the reverse would force a choice about which is "the" one.
-- bigint, not uuid: finance_transactions predates the uuid convention
-- and its id is a bigserial. Matching the referenced column rather than
-- following the house style is the whole job of a foreign key.
ALTER TABLE public.finance_documents
  ADD COLUMN IF NOT EXISTS transaction_id bigint REFERENCES public.finance_transactions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS finance_documents_transaction_idx
  ON public.finance_documents (transaction_id);

COMMENT ON COLUMN public.finance_documents.transaction_id IS
  'The spend this slip evidences. Null for platform statements, which are about income and belong to a period rather than a single transaction.';

-- ══ 2. THE PERSON SPENDING THE MONEY MUST BE ABLE TO FILE THE SLIP ═
--
-- Nina buys things for the properties and is therefore the one holding
-- the receipt. She is a host, and every finance policy today requires
-- is_org_admin() or the statements.upload permission — so she could not
-- file a slip at all, which is exactly why they end up on WhatsApp.
--
-- These policies are scoped to doc_type = 'receipt' ON PURPOSE. A host
-- gets to add and see receipts; platform statements stay admin-only,
-- because those carry the revenue figures and "let Nina file a slip" is
-- not a reason to show her what the properties earn.
DROP POLICY IF EXISTS finance_documents_receipt_insert ON public.finance_documents;
CREATE POLICY finance_documents_receipt_insert ON public.finance_documents FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND org_id = public.current_org_id()
    AND public.is_org_member(org_id)
    AND doc_type = 'receipt'
    AND uploaded_by = auth.uid()
  );

DROP POLICY IF EXISTS finance_documents_receipt_select ON public.finance_documents;
CREATE POLICY finance_documents_receipt_select ON public.finance_documents FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND org_id = public.current_org_id()
    AND public.is_org_member(org_id)
    AND doc_type = 'receipt'
  );

-- Correcting your own mistake is part of filing: a blurred photo or the
-- wrong property. Your own, not anyone else's, and only while it is
-- still a receipt.
DROP POLICY IF EXISTS finance_documents_receipt_own_delete ON public.finance_documents;
CREATE POLICY finance_documents_receipt_own_delete ON public.finance_documents FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND org_id = public.current_org_id()
    AND doc_type = 'receipt'
    AND (uploaded_by = auth.uid() OR public.is_org_admin(org_id))
  );

-- ══ 3. THE SAME, FOR THE FILE ITSELF ══════════════════════════════
-- Receipts live under {org_id}/receipts/… so the path can carry the
-- distinction the policy needs. Statements keep their existing location
-- and their existing admin-only policies, untouched.
DROP POLICY IF EXISTS finance_receipts_storage_insert ON storage.objects;
CREATE POLICY finance_receipts_storage_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'finance-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = (public.current_org_id())::text
    AND (storage.foldername(name))[2] = 'receipts'
    AND public.is_org_member(public.current_org_id())
  );

DROP POLICY IF EXISTS finance_receipts_storage_select ON storage.objects;
CREATE POLICY finance_receipts_storage_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'finance-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = (public.current_org_id())::text
    AND (storage.foldername(name))[2] = 'receipts'
    AND public.is_org_member(public.current_org_id())
  );

-- ══ 4. WHETHER THE OWNER GETS THE PICTURES ════════════════════════
--
-- The owner's invoice gets the ITEMISED SPEND either way — that is the
-- justification for what they are being billed. The photographs are a
-- different question: for S&N they are an internal record kept for SARS,
-- and the owner has never asked to see them.
--
-- Off by default, because that is the answer that surprises nobody, and
-- a tickbox for agencies whose owners do want them attached. Per org
-- rather than per property: it is a house style, and an agency that
-- sends slips sends them to everyone.
ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS invoice_include_receipts boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.org_settings.invoice_include_receipts IS
  'Attach receipt images to owner invoices. Off by default: the itemised spend is always shown, but the photographs are usually an internal record kept for tax rather than something the owner asked for.';

-- End 900_expense_receipts.
