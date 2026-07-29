-- 580_multi_tenant_rls_hardening.sql
-- Runs on BOTH databases — production and staging. Already APPLIED directly
-- to both via the Supabase MCP connector on 2026-07-29; this file documents
-- what was done for the repo's record and for anyone re-provisioning a
-- fresh database from scratch. Safe to re-run (IF EXISTS / IF NOT EXISTS
-- guards throughout).
--
-- Triggered by testing the new internal org-creation tool for the first
-- time: the first-ever second organization could immediately see S&N's
-- real guest data across several tables, and a handful of additional
-- holes were found while auditing (get_advisors) once direct DB access
-- was available. Full list below.

-- =====================================================================
-- 1. update_booking_revenue(bigint, numeric) — SECURITY DEFINER, no
--    internal checks, unused by any client code, and was executable by
--    PUBLIC (which anon inherits from — revoking only from named roles
--    like "anon"/"authenticated" does NOT remove a PUBLIC grant). Anyone
--    with just the public anon key could rewrite any booking's revenue
--    for any org. Revoke entirely — nothing legitimate calls it.
-- =====================================================================
REVOKE EXECUTE ON FUNCTION public.update_booking_revenue(bigint, numeric) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- 2. booking_checklists / property_inspections — each had redundant
--    wide-open policies (allow_all_booking_checklists; org_insert_
--    inspections / org_read_inspections / org_update_inspections) sitting
--    alongside already-correct org-scoped ones, effectively bypassing
--    them. Both tables are only ever touched by real authenticated
--    sessions (booking_checklists from index_fixed.html, property_
--    inspections from domestic.html's "Nina" flows) — wait, see note in
--    section 4 below re: property_inspections' anon requirement.
-- =====================================================================
DROP POLICY IF EXISTS allow_all_booking_checklists ON public.booking_checklists;
DROP POLICY IF EXISTS org_insert_inspections ON public.property_inspections;
DROP POLICY IF EXISTS org_read_inspections ON public.property_inspections;
DROP POLICY IF EXISTS org_update_inspections ON public.property_inspections;

-- =====================================================================
-- 3. domestics / cleaner_availability / inventory_reports — none of
--    these were org-scoped for authenticated users at all (domestics and
--    cleaner_availability didn't even have an org_id column). Any real
--    authenticated user in ANY org could read/write every org's cleaning
--    schedule, cleaner availability, and inventory reports.
-- =====================================================================
ALTER TABLE public.domestics ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
UPDATE public.domestics SET org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' WHERE org_id IS NULL;

DROP POLICY IF EXISTS authenticated_all_domestics ON public.domestics;
CREATE POLICY domestics_authenticated_org_scoped ON public.domestics FOR ALL USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

ALTER TABLE public.cleaner_availability ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
UPDATE public.cleaner_availability SET org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' WHERE org_id IS NULL;

DROP POLICY IF EXISTS authenticated_all_cleaner_availability ON public.cleaner_availability;
DROP POLICY IF EXISTS allow_all_cleaner_availability ON public.cleaner_availability;
CREATE POLICY cleaner_availability_authenticated_org_scoped ON public.cleaner_availability FOR ALL USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

DROP POLICY IF EXISTS authenticated_all_inventory_reports ON public.inventory_reports;
DROP POLICY IF EXISTS allow_all_inventory_reports ON public.inventory_reports;
CREATE POLICY inventory_reports_authenticated_org_scoped ON public.inventory_reports FOR ALL USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

-- =====================================================================
-- 4. Anon (PIN-based staff portal) access — domestic.html has NO real
--    Supabase Auth session anywhere, for cleaners OR "Nina" (her PIN just
--    unlocks a different view in the same anon-role file). Every query
--    from that file, including hers, runs as anon. Rather than the
--    previous blanket "allow_all"/no-role-check policies, each table
--    below gets anon access scoped to EXACTLY the operations domestic.html
--    performs (verified by grep against the live client code) — no anon
--    SELECT/UPDATE/DELETE where nothing ever calls it.
--
--    domestics' pre-existing anon_domestics_select/insert/update policies
--    are untouched (still blanket "true") — properly scoping those needs
--    a real redesign (token-based, matching get_outside_clean_info's
--    pattern used by the separate outside-cleaner flow), not a quick
--    policy edit. Tracked as follow-up work, not done here.
-- =====================================================================
CREATE POLICY cleaner_availability_anon_select ON public.cleaner_availability FOR SELECT USING (auth.role() = 'anon');
CREATE POLICY cleaner_availability_anon_insert ON public.cleaner_availability FOR INSERT WITH CHECK (auth.role() = 'anon');
CREATE POLICY cleaner_availability_anon_update ON public.cleaner_availability FOR UPDATE USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');

CREATE POLICY inventory_reports_anon_select ON public.inventory_reports FOR SELECT USING (auth.role() = 'anon');
CREATE POLICY inventory_reports_anon_insert ON public.inventory_reports FOR INSERT WITH CHECK (auth.role() = 'anon');

CREATE POLICY property_inspections_anon_select ON public.property_inspections FOR SELECT USING (auth.role() = 'anon');
CREATE POLICY property_inspections_anon_insert ON public.property_inspections FOR INSERT WITH CHECK (auth.role() = 'anon');

-- Sanity checks after running — first two should return 0 on both databases:
--   SELECT count(*) FROM public.domestics WHERE org_id IS NULL;
--   SELECT count(*) FROM public.cleaner_availability WHERE org_id IS NULL;

-- End 580_multi_tenant_rls_hardening.
