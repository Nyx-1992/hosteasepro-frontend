-- 760_current_org_id_profiles_fix.sql
-- CORRECTIVE — runs on BOTH databases. NO-OP on the live databases: both
-- already hold exactly this definition. Its purpose is to make the
-- migration files reproduce the databases that actually exist.
--
-- 085_is_org_functions_profiles_fix.sql fixed is_org_admin and
-- is_org_member, which 070/080 had pointed at the unused legacy
-- public.user_profiles table. It did NOT fix current_org_id, which
-- 030_rls_helpers.sql defines the same broken way:
--
--     SELECT org_id FROM public.user_profiles WHERE user_id = auth.uid()
--
-- user_profiles is empty (confirmed on production, 2026-07-31: 0 rows,
-- while public.profiles holds the three real users). So a database
-- rebuilt from the migration files alone would get a current_org_id that
-- returns NULL for every user — and since essentially every RLS policy
-- in this project is gated on `org_id = public.current_org_id()`, every
-- table would read as empty for everyone. The live databases are fine
-- because the working definition was applied to them directly at some
-- point; only the files were left behind.
--
-- 085 actually noticed this in passing — its header records that the
-- real, verified-live current_org_id is "this simpler `language sql`
-- form against profiles" — but it only ever redefined the other two
-- functions. This migration closes that gap.
--
-- Body reproduced verbatim from pg_get_functiondef on production
-- (2026-07-31), including SECURITY DEFINER, which 030's version lacked:
-- without it the function is subject to the caller's own RLS on
-- profiles, which is the kind of circular dependency that makes policies
-- fail in ways that are miserable to debug.
--
-- profiles columns: id uuid (= auth.uid() directly, there is no separate
-- user_id column), org_id uuid, name text, role text, initials text.

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Verification, as a real logged-in user:
--   SELECT public.current_org_id();            -- expect your org's uuid
--   SELECT public.is_org_admin(public.current_org_id());
--
-- If current_org_id() returns NULL for a user who has a profiles row,
-- something has re-broken this function — check for a later migration
-- reintroducing the user_profiles version.

-- End 760_current_org_id_profiles_fix.
