-- 085_is_org_functions_profiles_fix.sql
-- CORRECTIVE — runs on BOTH databases. Fixes an active incident: 070 and 080
-- overwrote the live is_org_admin/is_org_member functions (which correctly
-- queried public.profiles) with versions querying public.user_profiles, an
-- unused/legacy table (see README.md "ACTIVE INCIDENT"). Since then, every
-- policy gated by these functions with no wide-open fallback has been
-- denying real users — confirmed on production: properties_modify,
-- bookings_update, contacts_modify.
--
-- public.profiles columns (confirmed via information_schema, 2026-07-18):
--   id uuid (= auth.uid() directly, no separate user_id column), org_id
--   uuid, name text, role text, initials text.
--
-- Run this BEFORE 100_rls_parity.sql on any database.

-- Style matches the confirmed-live current_org_id() (030_rls_helpers.sql
-- claimed a plpgsql/user_profiles version, but its real body — verified via
-- pg_get_functiondef, 2026-07-18 — is this simpler `language sql` form
-- against profiles, with no defensive existence check. Matching that
-- established pattern here instead of the more defensive style 070/080
-- carried over by mistake.

CREATE OR REPLACE FUNCTION public.is_org_admin(org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
	SELECT EXISTS (
		SELECT 1 FROM public.profiles p
		WHERE p.id = auth.uid() AND p.org_id = org AND p.role IN ('owner','admin')
	);
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
	SELECT EXISTS (
		SELECT 1 FROM public.profiles p
		WHERE p.id = auth.uid() AND p.org_id = org AND p.role IN ('owner','admin','host')
	);
$$;

-- Verification: as a real logged-in owner/admin, run
--   SELECT is_org_admin(org_id) FROM public.profiles WHERE id = auth.uid();
-- and confirm it returns true (run via the app's session, not the SQL
-- editor's postgres role — auth.uid() is null there).

-- End 085_is_org_functions_profiles_fix.
