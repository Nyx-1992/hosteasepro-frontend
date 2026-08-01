-- 890_security_audit_fixes.sql
-- Runs on BOTH databases. SECURITY-CRITICAL.
--
-- Findings from a full audit of the database, in severity order.
--
-- ══ 1. ANY SIGNED-IN USER COULD READ AND WRITE EVERY ORGANISATION ══
--
-- organizations carried exactly two policies:
--     org_select : auth.role() = 'authenticated'
--     org_write  : auth.role() = 'authenticated'
--
-- No org scoping at all. Verified before this migration: the TV House
-- CLIENT — an external customer with access to one property — could list
-- all three organisations by name, and org_write would have let them
-- rename or delete any of them, including S&N's.
--
-- This survived migration 824 because 824 only rewrote policies that
-- mentioned current_org_id(), and these never did. A policy too loose to
-- reference the org at all was invisible to a sweep that keyed on the
-- org. Worth remembering: an audit that looks for "policies scoped to
-- the wrong thing" misses "policies scoped to nothing".
DROP POLICY IF EXISTS org_select ON public.organizations;
CREATE POLICY org_select ON public.organizations FOR SELECT USING (
  auth.role() = 'authenticated' AND (
    -- Staff see their own org.
    public.is_org_member(id)
    -- A client sees the org that manages their property, because the
    -- dashboard prints "Managed by ..." — but that one row only.
    OR EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.org_id = organizations.id
        AND p.id = ANY (public.client_property_uuids())
    )
  )
);

-- Renaming or deleting an organisation is an admin act, on your own org.
DROP POLICY IF EXISTS org_write ON public.organizations;
CREATE POLICY org_update ON public.organizations FOR UPDATE
  USING (auth.role() = 'authenticated' AND public.is_org_admin(id))
  WITH CHECK (auth.role() = 'authenticated' AND public.is_org_admin(id));

-- No DELETE policy at all: nothing in the app deletes an organisation,
-- and the one that would (closing an account) belongs server-side with
-- the service role, not in a browser.
--
-- INSERT stays open to authenticated because api/create-org.js and
-- api/signup.js run with the service role and bypass RLS anyway; a
-- browser creating an org row on its own gets an org it is not a member
-- of, which is useless to it.
DROP POLICY IF EXISTS org_insert ON public.organizations;
CREATE POLICY org_insert ON public.organizations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ══ 2. A TRIGGER FUNCTION WAS CALLABLE AS AN API ENDPOINT ══════════
--
-- enforce_subscription_write() is the write gate from 880. It is meant
-- to be fired by triggers, never invoked. PostgREST exposes every
-- function in the public schema, so it sat on /rest/v1/rpc/ as a
-- SECURITY DEFINER callable by anon. Calling it outside a trigger errors
-- rather than doing damage, but a function that can only misbehave when
-- called directly should not be callable directly.
REVOKE EXECUTE ON FUNCTION public.enforce_subscription_write() FROM PUBLIC, anon, authenticated;

-- org_can_write() is read only by that trigger. Authenticated keeps it
-- so the app can explain a refusal; anon has no use for it.
REVOKE EXECUTE ON FUNCTION public.org_can_write(uuid) FROM anon;

-- ══ 3. TRIGGER FUNCTIONS WITHOUT A FIXED search_path ══════════════
--
-- Ten trigger functions ran with a mutable search_path. They are
-- SECURITY INVOKER so the exposure is small, but the fix is one line
-- each and it removes a whole class of schema-shadowing trick.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prorettype = 'trigger'::regtype
       AND (p.proconfig IS NULL OR NOT EXISTS (
             SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
  END LOOP;
END $$;

-- ══ 4. POLICIES ON A DEAD TABLE ═══════════════════════════════════
--
-- user_profiles is the empty legacy table that already caused two
-- separate incidents (085 for is_org_admin, 760 for current_org_id, 822
-- for property_users' foreign key). It still carries three policies,
-- which makes it look live to anyone auditing. Nothing reads or writes
-- it. The policies go; the table is left in place because dropping a
-- table is not something to do quietly in a security migration.
DROP POLICY IF EXISTS user_profiles_select ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_insert ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_update ON public.user_profiles;

COMMENT ON TABLE public.user_profiles IS
  'DEAD LEGACY TABLE — always empty. Superseded by public.profiles. Left in place only because three separate bugs came from code still pointing at it (085, 760, 822); do not add anything here.';

-- End 890_security_audit_fixes.
