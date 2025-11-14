-- 001_seed_core.sql
-- Core seed: initial organization + admin & manager profiles (idempotent).
-- Requires: tables from 001 migration, auth.users rows for listed emails.

DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='organizations') THEN
		RAISE EXCEPTION 'Table public.organizations not found.';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_profiles') THEN
		RAISE EXCEPTION 'Table public.user_profiles not found.';
	END IF;
END $$;

-- Insert first organization (idempotent)
WITH existing AS (
	SELECT id FROM public.organizations WHERE name = 'S&N Apt Management'
), ins AS (
	INSERT INTO public.organizations (id, name)
	SELECT gen_random_uuid(), 'S&N Apt Management'
	WHERE NOT EXISTS (SELECT 1 FROM existing)
	RETURNING id
)
SELECT COALESCE((SELECT id FROM existing),(SELECT id FROM ins)) AS organization_id;

-- Helper has_org_role (if later needed by policies)
CREATE OR REPLACE FUNCTION public.has_org_role(p_org uuid, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE AS $$
	SELECT EXISTS (
		SELECT 1 FROM public.user_profiles
		WHERE org_id = p_org AND user_id = auth.uid() AND role = ANY (p_roles)
	);
$$;

-- Admin profile (requires auth.users row with email)
WITH org AS (
	SELECT id FROM public.organizations WHERE name = 'S&N Apt Management' LIMIT 1
), admin_user AS (
	SELECT id FROM auth.users WHERE email = 'sn_apt_management@outlook.com'
)
INSERT INTO public.user_profiles (user_id, org_id, role)
SELECT admin_user.id, org.id, 'admin'
FROM org, admin_user
WHERE admin_user.id IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM public.user_profiles p WHERE p.user_id = admin_user.id AND p.org_id = org.id AND p.role = 'admin'
	);

-- Manager profile (Nina)
WITH org AS (
	SELECT id FROM public.organizations WHERE name = 'S&N Apt Management' LIMIT 1
), manager_user AS (
	SELECT id FROM auth.users WHERE email = 'vanwyk.nina@gmail.com'
)
INSERT INTO public.user_profiles (user_id, org_id, role)
SELECT manager_user.id, org.id, 'manager'
FROM org, manager_user
WHERE manager_user.id IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM public.user_profiles p WHERE p.user_id = manager_user.id AND p.org_id = org.id AND p.role = 'manager'
	);

-- Verification (run manually if needed):
-- SELECT * FROM public.organizations;
-- SELECT u.email, p.role FROM public.user_profiles p JOIN auth.users u ON u.id = p.user_id;
