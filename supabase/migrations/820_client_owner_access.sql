-- 820_client_owner_access.sql
-- Runs on BOTH databases.
--
-- Foundation for CLIENT OWNER LOGINS: a property owner who is S&N's
-- customer logs in and sees their own property — bookings, real income,
-- cleaning, inspections — and nothing else. Starting with TV House.
--
-- ── THE PROBLEM THAT HAD TO BE FIXED FIRST ────────────────────────
--
-- Tables identify a property TWO different ways:
--     uuid  — bookings, property_inspections, inventory_reports,
--             domestic_services, tasks
--     text  — domestics, platform_earnings, platform_statement_lines,
--             finance_documents        (values 'speranta' / 'tvhouse')
--
-- and the text key existed ONLY as an app-side convention:
--     name.includes('tv') ? 'tvhouse' : ...
-- properties.code is 'TVH'/'SPER', which is a different thing entirely.
--
-- So there was no way to answer "which rows belong to this property?"
-- in SQL. Any access rule written without fixing that would have covered
-- the uuid tables and silently missed the text ones — which is precisely
-- where the money is (platform_earnings). properties.short_key makes the
-- convention real data, which is also what a third property will need.
--
-- ── WHAT A CLIENT MAY SEE ─────────────────────────────────────────
--
-- SELECT only, on their own property: bookings, platform_earnings,
-- platform_statement_lines, property_inspections, inventory_reports,
-- domestics, domestic_services. No writes of any kind.
--
-- finance_documents is DELIBERATELY EXCLUDED, and this is the subtle
-- one: an Airbnb earnings report lists EVERY home on the account. The
-- extracted per-property figures are safe to show, but the source PDF is
-- not — handing a client that file would show them another owner's
-- income. They get the numbers, never the document.
--
-- Business data (budget, pricing plans, business_vault, team_contacts,
-- role_permissions) is untouched here, so clients have no access at all:
-- those policies require is_org_admin or an explicit permission, and
-- 'client' is neither.

-- ── 1. Make the short key real data ───────────────────────────────
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS short_key text;

UPDATE public.properties SET short_key = 'speranta'
  WHERE short_key IS NULL AND lower(name) LIKE '%speranta%';
-- Parenthesised deliberately: AND binds tighter than OR, so without the
-- brackets a future edit to either branch could drop the IS NULL guard
-- and overwrite a key that was already set correctly.
UPDATE public.properties SET short_key = 'tvhouse'
  WHERE short_key IS NULL
    AND (lower(name) LIKE 'tv house%' OR lower(name) LIKE '%tv house%' OR lower(name) LIKE 'tvhouse%');
-- Anything else falls back to a slug of the code, so a new property is
-- never left without a key.
UPDATE public.properties SET short_key = lower(regexp_replace(COALESCE(code, id::text), '[^a-zA-Z0-9]', '', 'g'))
  WHERE short_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS properties_short_key_uniq
  ON public.properties (org_id, short_key);

COMMENT ON COLUMN public.properties.short_key IS
  'Stable short identifier (''tvhouse'', ''speranta'') used as property_id by the text-keyed tables: domestics, platform_earnings, platform_statement_lines, finance_documents. Was an app-side naming convention with no database representation until 820.';

-- ── 2. Which properties does the current user own as a client? ────
-- SECURITY DEFINER so the lookup itself is not subject to the caller's
-- RLS, exactly like is_org_admin.
CREATE OR REPLACE FUNCTION public.client_property_uuids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(pu.property_id), ARRAY[]::uuid[])
  FROM public.property_users pu
  WHERE pu.user_id = auth.uid() AND pu.role = 'client';
$$;

CREATE OR REPLACE FUNCTION public.client_property_keys()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(p.short_key), ARRAY[]::text[])
  FROM public.property_users pu
  JOIN public.properties p ON p.id = pu.property_id
  WHERE pu.user_id = auth.uid() AND pu.role = 'client' AND p.short_key IS NOT NULL;
$$;

-- Convenience predicates used by the policies below.
CREATE OR REPLACE FUNCTION public.is_client_property(prop uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT prop = ANY (public.client_property_uuids());
$$;

CREATE OR REPLACE FUNCTION public.is_client_property_key(prop text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT prop = ANY (public.client_property_keys());
$$;

REVOKE ALL ON FUNCTION public.client_property_uuids()      FROM public;
REVOKE ALL ON FUNCTION public.client_property_keys()       FROM public;
REVOKE ALL ON FUNCTION public.is_client_property(uuid)     FROM public;
REVOKE ALL ON FUNCTION public.is_client_property_key(text) FROM public;
GRANT EXECUTE ON FUNCTION public.client_property_uuids()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_property_keys()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_client_property(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_client_property_key(text) TO authenticated;

-- ── 3. Read-only client policies ──────────────────────────────────
-- Added ALONGSIDE existing policies. Postgres ORs multiple permissive
-- policies together, so staff access is unchanged and this only ever
-- grants a client sight of their own property.

DROP POLICY IF EXISTS bookings_client_select ON public.bookings;
CREATE POLICY bookings_client_select ON public.bookings FOR SELECT USING (
  auth.role() = 'authenticated' AND public.is_client_property(property_id)
);

DROP POLICY IF EXISTS property_inspections_client_select ON public.property_inspections;
CREATE POLICY property_inspections_client_select ON public.property_inspections FOR SELECT USING (
  auth.role() = 'authenticated' AND public.is_client_property(property_id)
);

DROP POLICY IF EXISTS inventory_reports_client_select ON public.inventory_reports;
CREATE POLICY inventory_reports_client_select ON public.inventory_reports FOR SELECT USING (
  auth.role() = 'authenticated' AND public.is_client_property(property_id)
);

DROP POLICY IF EXISTS domestic_services_client_select ON public.domestic_services;
CREATE POLICY domestic_services_client_select ON public.domestic_services FOR SELECT USING (
  auth.role() = 'authenticated' AND public.is_client_property(property_id)
);

DROP POLICY IF EXISTS domestics_client_select ON public.domestics;
CREATE POLICY domestics_client_select ON public.domestics FOR SELECT USING (
  auth.role() = 'authenticated' AND public.is_client_property_key(property_id)
);

DROP POLICY IF EXISTS platform_earnings_client_select ON public.platform_earnings;
CREATE POLICY platform_earnings_client_select ON public.platform_earnings FOR SELECT USING (
  auth.role() = 'authenticated' AND public.is_client_property_key(property_id)
);

DROP POLICY IF EXISTS platform_statement_lines_client_select ON public.platform_statement_lines;
CREATE POLICY platform_statement_lines_client_select ON public.platform_statement_lines FOR SELECT USING (
  auth.role() = 'authenticated' AND public.is_client_property_key(property_id)
);

-- The client needs to read their own property row to display its name.
DROP POLICY IF EXISTS properties_client_select ON public.properties;
CREATE POLICY properties_client_select ON public.properties FOR SELECT USING (
  auth.role() = 'authenticated' AND public.is_client_property(id)
);

-- ── 4. Wire TV House to a client, if that profile exists ──────────
-- Deliberately conditional: this migration must run cleanly on a
-- database where the owner has not been invited yet. The actual link is
-- created from the app when S&N invites them.
-- (No-op today; kept so the intent is recorded next to the machinery.)

-- End 820_client_owner_access.
