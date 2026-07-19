-- 070_is_org_admin_fix.sql
-- Security hardening: is_org_admin (030_rls_helpers.sql) was missing
-- SECURITY DEFINER and an explicit search_path, which Supabase's database
-- linter flags as a "function search path mutable" risk (an object created
-- earlier in an attacker's search_path could shadow an unqualified
-- reference). Recreate with both locked down. No behavior change otherwise.
-- Safe to re-run (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.is_org_admin(org uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_exists boolean; BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_profiles'
	) THEN RETURN FALSE; END IF;
	SELECT EXISTS (
		SELECT 1 FROM public.user_profiles p
		WHERE p.user_id = auth.uid() AND p.org_id = org AND p.role IN ('owner','admin')
	) INTO v_exists;
	RETURN COALESCE(v_exists, FALSE);
END; $$;

-- End 070_is_org_admin_fix.
