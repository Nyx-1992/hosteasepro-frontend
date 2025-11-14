-- 030_rls_helpers.sql
-- RLS helper functions (stable, defensive). These must exist before policies (040).

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT auth.uid() $$;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE v_org uuid; BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_profiles'
	) THEN RETURN NULL; END IF;
	SELECT org_id INTO v_org FROM public.user_profiles WHERE user_id = auth.uid() LIMIT 1;
	RETURN v_org; END; $$;

CREATE OR REPLACE FUNCTION public.is_org_admin(org uuid)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE v_exists boolean; BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_profiles'
	) THEN RETURN FALSE; END IF;
	SELECT EXISTS (
		SELECT 1 FROM public.user_profiles p
		WHERE p.user_id = auth.uid() AND p.org_id = org AND p.role IN ('owner','admin')
	) INTO v_exists;
	RETURN COALESCE(v_exists, FALSE); END; $$;

-- Future: has_org_role(role text) helper if needed.

-- End helpers.
