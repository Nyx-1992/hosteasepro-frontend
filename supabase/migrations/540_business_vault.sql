-- 540_business_vault.sql
-- Runs on BOTH databases.
--
-- New table backing a "Business Info" tab: free-form sensitive business
-- records (banking details, tax/registration numbers, insurance policies)
-- that don't fit the Contacts directory (520_team_contacts.sql) — nothing
-- to call, just information to look up.
--
-- Unlike team_contacts (any org member can read, admin-only write), this
-- table is admin-only for BOTH read and write — the user's own framing was
-- "business eyes only (admin)", and this holds actual account numbers, not
-- day-to-day operational contact info.
--
-- Starts empty. No real banking/legal data existed anywhere in this
-- codebase to seed from, so there's nothing to transcribe — the owner adds
-- entries through the app.

CREATE TABLE IF NOT EXISTS public.business_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cat text NOT NULL DEFAULT 'other' CHECK (cat IN ('banking','legal','insurance','tax','other')),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_vault_org_id_idx ON public.business_vault (org_id);

CREATE OR REPLACE FUNCTION public.business_vault_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_vault_updated_at ON public.business_vault;
CREATE TRIGGER business_vault_updated_at
BEFORE UPDATE ON public.business_vault
FOR EACH ROW EXECUTE FUNCTION public.business_vault_updated_at();

ALTER TABLE public.business_vault ENABLE ROW LEVEL SECURITY;

-- Admin-only for select AND write — deliberately tighter than
-- team_contacts_select (080/085's is_org_member), since a host role
-- (Nina) should never be able to read this table even via direct API
-- access, not just have it hidden in the UI.
DROP POLICY IF EXISTS business_vault_select ON public.business_vault;
CREATE POLICY business_vault_select ON public.business_vault FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS business_vault_insert ON public.business_vault;
CREATE POLICY business_vault_insert ON public.business_vault FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS business_vault_update ON public.business_vault;
CREATE POLICY business_vault_update ON public.business_vault FOR UPDATE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
) WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS business_vault_delete ON public.business_vault;
CREATE POLICY business_vault_delete ON public.business_vault FOR DELETE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

-- End 540_business_vault.
