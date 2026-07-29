-- 650_finance_documents_storage.sql
-- Runs on BOTH databases.
--
-- Storage bucket + RLS backing 640_finance_documents.sql's uploaded files.
-- Private bucket (not public) — objects are only reachable via a signed
-- URL issued to an authenticated org admin, same access model as the
-- table row describing them.
--
-- Object paths are "<org_id>/<uuid>-<filename>" so storage.foldername()
-- gives a clean per-org folder to scope every policy on — this is the
-- first table in this app to use Supabase Storage at all, so there's no
-- existing convention to match; chose the standard org-folder-prefix
-- pattern Supabase's own docs use for multi-tenant buckets.

INSERT INTO storage.buckets (id, name, public)
VALUES ('finance-documents', 'finance-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS finance_documents_storage_select ON storage.objects;
CREATE POLICY finance_documents_storage_select ON storage.objects FOR SELECT USING (
  bucket_id = 'finance-documents'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = public.current_org_id()::text
  AND public.is_org_admin(public.current_org_id())
);

DROP POLICY IF EXISTS finance_documents_storage_insert ON storage.objects;
CREATE POLICY finance_documents_storage_insert ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'finance-documents'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = public.current_org_id()::text
  AND public.is_org_admin(public.current_org_id())
);

DROP POLICY IF EXISTS finance_documents_storage_delete ON storage.objects;
CREATE POLICY finance_documents_storage_delete ON storage.objects FOR DELETE USING (
  bucket_id = 'finance-documents'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = public.current_org_id()::text
  AND public.is_org_admin(public.current_org_id())
);

-- End 650_finance_documents_storage.
