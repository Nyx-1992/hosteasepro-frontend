-- 824_org_policies_require_membership.sql
-- Runs on BOTH databases. SECURITY-CRITICAL — read the note before editing.
--
-- 27 policies were shaped:
--     auth.role() = 'authenticated' AND org_id = current_org_id()
--
-- That grants on ORG MEMBERSHIP ALONE, with no role check. It was fine
-- for as long as everyone in an org was staff. It stops being fine the
-- instant a CLIENT profile exists in the same org: a client satisfies
-- current_org_id() and is therefore handed the entire business — every
-- booking, both properties, the cleaning log, invoices, org settings.
--
-- This was NOT theoretical. Tested before this migration, with 820's
-- per-property policies already in place, a client saw 374 bookings and
-- both properties. The lesson worth keeping: in Postgres, permissive
-- policies are OR-ed, so ADDING a narrow policy can never restrict
-- anything — the widest existing policy always wins. Restriction has to
-- happen in the policy that is already too wide.
--
-- Fix: additionally require is_org_member(...), which is exactly
-- role IN ('owner','admin','host'). Staff are entirely unaffected;
-- 'client' is excluded here and served only by 820's per-property rules.
--
-- Rebuilt DYNAMICALLY from each policy's live definition rather than
-- retyped, so no existing condition can be lost in transcription — only
-- the extra AND is introduced. The org column is resolved per table:
-- most have org_id; org_settings keys on its own id; property_users has
-- neither and reaches org through properties.
--
-- VERIFIED on staging, before and after, with real accounts:
--   owner / admin / host — identical counts across bookings (374),
--   properties (2), domestics (58), tasks (6), invoices (1),
--   property_manuals (6), inspections (1), org_settings (1),
--   booking_checklists (364). No staff access changed.
--   client — TV House only: 163 of 374 bookings, 16 of 58 cleans,
--   tvhouse earnings only, and budget / pricing / statements / staff pay
--   / vault / invoices / tasks / org settings all hidden.
DO $$
DECLARE r record; q text; w text; v_roles text; v_member text;
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname, p.cmd, p.qual::text AS qual,
           p.with_check::text AS wc, p.roles AS rls
    FROM pg_policies p
    WHERE p.schemaname='public'
      AND p.qual::text LIKE '%current_org_id()%'
      AND p.qual::text NOT LIKE '%is_org_admin%'
      AND p.qual::text NOT LIKE '%is_org_member%'
      AND p.qual::text NOT LIKE '%has_permission%'
      AND p.qual::text NOT LIKE '%is_client_property%'
      AND p.tablename <> 'user_profiles'   -- dead legacy table, leave alone
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema='public' AND c.table_name=r.tablename AND c.column_name='org_id') THEN
      v_member := 'public.is_org_member(org_id)';
    ELSIF r.tablename = 'org_settings' THEN
      v_member := 'public.is_org_member(id)';
    ELSIF r.tablename = 'property_users' THEN
      v_member := 'public.is_org_member((SELECT pr.org_id FROM public.properties pr WHERE pr.id = property_users.property_id))';
    ELSE
      RAISE NOTICE 'skipped %: no org column resolvable', r.tablename;
      CONTINUE;
    END IF;

    q       := '(' || r.qual || ') AND ' || v_member;
    v_roles := array_to_string(r.rls, ',');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    IF r.wc IS NULL THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s USING (%s)',
                     r.policyname, r.tablename, r.cmd, v_roles, q);
    ELSE
      w := '(' || r.wc || ') AND ' || v_member;
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s USING (%s) WITH CHECK (%s)',
                     r.policyname, r.tablename, r.cmd, v_roles, q, w);
    END IF;
  END LOOP;
END $$;
