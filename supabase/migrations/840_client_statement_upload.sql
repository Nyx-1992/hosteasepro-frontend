-- 840_client_statement_upload.sql
-- Runs on BOTH databases.
--
-- Lets a CLIENT property owner upload their own platform statements.
--
-- Why it is needed: S&N receives LekkeSlaap and Airbnb statements because
-- S&N set those listings up. Booking.com goes to the owner directly, so
-- S&N literally cannot upload what it never receives. Without this, a
-- client's income figures are permanently incomplete. The owner's call
-- was to keep both routes open — the client can send the PDF to S&N, or
-- upload it themselves.
--
-- ── WHAT A CLIENT MAY AND MAY NOT DO ──────────────────────────────
--
-- MAY:  insert a finance_documents row for their OWN property, and read
--       back ONLY the documents they themselves uploaded.
-- MAY NOT: read S&N's documents, or write platform_earnings.
--
-- Both restrictions matter and neither is incidental:
--
--   * An Airbnb earnings report lists EVERY home on the account. Letting
--     a client read S&N's documents would show them another owner's
--     income. Hence uploaded_by = auth.uid() rather than a property
--     match — a client sees their own paperwork and nothing else.
--
--   * platform_earnings stays admin-only to write. A client uploading a
--     statement is providing EVIDENCE, not declaring their own income.
--     S&N still reads it, checks the parsed figures and saves them. If a
--     client could write earnings directly they could restate what they
--     were owed, which is exactly the kind of number that should have a
--     second pair of eyes on it.
--
-- The result is a clean division: the client supplies the document, S&N
-- turns it into a figure.

-- ── Table ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS finance_documents_client_insert ON public.finance_documents;
CREATE POLICY finance_documents_client_insert ON public.finance_documents FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
  AND org_id = public.current_org_id()
  AND public.is_client_property_key(property_id)
  -- Stamped with the uploader, which is what the read policy below keys
  -- off. Without this a client could insert a row they then cannot see.
  AND uploaded_by = auth.uid()
);

DROP POLICY IF EXISTS finance_documents_client_select ON public.finance_documents;
CREATE POLICY finance_documents_client_select ON public.finance_documents FOR SELECT USING (
  auth.role() = 'authenticated' AND uploaded_by = auth.uid()
);

-- Deliberately NO update or delete for clients: once a statement is
-- handed over it is a record, and S&N's figures may already reference it.

-- ── Storage ───────────────────────────────────────────────────────
-- 650's policies require is_org_admin. A client is not an admin, so
-- without this their upload would be accepted by the table and rejected
-- by the bucket — a half-failure that leaves a document row pointing at
-- a file that does not exist.
--
-- Same folder convention as 650: "<org_id>/<uuid>-<filename>".
DROP POLICY IF EXISTS finance_documents_storage_client_insert ON storage.objects;
CREATE POLICY finance_documents_storage_client_insert ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'finance-documents'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = public.current_org_id()::text
  AND array_length(public.client_property_uuids(), 1) >= 1
);

-- A client may read back a file only if it belongs to a document row
-- they uploaded. Checking through finance_documents rather than the path
-- means the rule cannot drift from the table's own rule.
DROP POLICY IF EXISTS finance_documents_storage_client_select ON storage.objects;
CREATE POLICY finance_documents_storage_client_select ON storage.objects FOR SELECT USING (
  bucket_id = 'finance-documents'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.finance_documents fd
    WHERE fd.file_path = storage.objects.name
      AND fd.uploaded_by = auth.uid()
  )
);

-- End 840_client_statement_upload.
