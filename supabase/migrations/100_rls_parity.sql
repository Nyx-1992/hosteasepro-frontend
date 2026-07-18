-- 100_rls_parity.sql
-- Runs on BOTH databases — production and staging. Idempotent throughout
-- (DROP POLICY IF EXISTS + CREATE), safe to re-run.
--
-- >>> PREREQUISITE: run 085_is_org_functions_profiles_fix.sql on a
-- >>> database FIRST (see "ACTIVE INCIDENT" in README.md). This file's
-- >>> policies call is_org_admin()/is_org_member() by name; until 085
-- >>> fixes them to query public.profiles instead of the unused
-- >>> public.user_profiles, every policy gated by them below will deny
-- >>> everyone, on whichever database you run this on.
--
-- >>> RUN ORDER: staging first. Complete the smoke-test checklist below on
-- >>> staging. Only once that passes, run this same file on production.
--
-- Derived from a live pg_policies dump of both databases (2026-07-18), not
-- guessed. Production itself was inconsistent (see README.md's "Findings"
-- section), so this does not mechanically mirror prod's pre-existing
-- policies verbatim — it defines one clean target state and applies it to
-- both databases, closing gaps on staging AND fixing the same bugs on
-- production. Three deliberate departures from what production had before:
--
-- 1. Where production had a narrow/clean policy but ALSO a redundant
--    wide-open one layered on top of it (tasks, booking_checklists,
--    invoices, property_inspections) — meaning prod's *actual* behavior
--    there was just as open as staging's — this migration drops the
--    wide-open policy on both databases and keeps ONLY the narrow one.
--
-- 2. financial_transactions and ical_feeds: production previously gated
--    these via custom JWT claims (auth.jwt()->>'org_id', current_setting
--    ('request.jwt.claim.org_id')) set by something outside this repo
--    (likely a Supabase Auth Hook), rather than this repo's own
--    current_org_id()/is_org_admin() helpers. Moving both databases onto
--    the same helper-function pattern used everywhere else, so behavior
--    no longer depends on unverified JWT claim wiring.
--
-- 3. invoices and property_inspections: production's old "narrow" policies
--    on these two hardcoded ONE LITERAL org_id UUID (production's own
--    org) — meaningless/dangerous on staging (a different org_id) and
--    fragile on production too (breaks if the org's UUID ever changes).
--    Using current_org_id() instead on both databases.
--
-- Tables intentionally left untouched (no narrow alternative existed on
-- either database, or already identical/correct on both):
--   booking_audit, cleaner_availability, domestic_services_detailed (not
--   org-scoped on either database), finance_transactions, import_runs,
--   inventory_reports, kb_articles, monthly_earnings (not org-scoped on
--   either database), organizations, roadmap_state, domestics, org_settings,
--   profiles (the real role table — untouched, already correct).
--
-- ===========================================================================
-- SMOKE-TEST CHECKLIST — run after applying to staging, before touching prod
-- ===========================================================================
--   [ ] Owner login -> open a booking -> edit and save successfully
--   [ ] Nina (host) login -> toggle a booking through the pipeline stages
--   [ ] Nina (host) login -> assign a clean to a cleaner
--   [ ] Staff portal, PIN login (anon path) -> submit availability
--   [ ] Staff portal, PIN login (anon path) -> mark a clean done
--   [ ] Trigger an iCal sync -> confirm events import without RLS errors
--   [ ] View an invoice as owner/admin
-- ===========================================================================

-- =====================================================================
-- bookings — staging had an extra wide-open policy prod never had, and
-- was missing the org-scoped select/insert prod does have.
-- =====================================================================
DROP POLICY IF EXISTS authenticated_all_bookings ON public.bookings;

DROP POLICY IF EXISTS bookings_select ON public.bookings;
CREATE POLICY bookings_select ON public.bookings FOR SELECT USING (
	auth.role() = 'authenticated' AND ((org_id IS NULL) OR (org_id = current_org_id()))
);

DROP POLICY IF EXISTS bookings_insert ON public.bookings;
CREATE POLICY bookings_insert ON public.bookings FOR INSERT WITH CHECK (
	auth.role() = 'authenticated' AND ((org_id IS NULL) OR (org_id = current_org_id()))
);
-- bookings_update, anon_insert_direct_bookings, anon_select_bookings_for_domestic
-- already correct on staging — untouched.

-- =====================================================================
-- booking_checklists — drop the redundant wide-open policy; add the
-- missing select/insert (update already correct from 080).
-- =====================================================================
DROP POLICY IF EXISTS authenticated_all_booking_checklists ON public.booking_checklists;

DROP POLICY IF EXISTS booking_checklists_select ON public.booking_checklists;
CREATE POLICY booking_checklists_select ON public.booking_checklists FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

DROP POLICY IF EXISTS booking_checklists_insert ON public.booking_checklists;
CREATE POLICY booking_checklists_insert ON public.booking_checklists FOR INSERT WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

-- =====================================================================
-- contacts — drop wide-open; add missing select (modify already correct).
-- =====================================================================
DROP POLICY IF EXISTS authenticated_all_contacts ON public.contacts;

DROP POLICY IF EXISTS contacts_select ON public.contacts;
CREATE POLICY contacts_select ON public.contacts FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

-- =====================================================================
-- domestic_services — drop wide-open; add missing select/insert (update
-- already correct). Legacy/unused table (see README) but kept consistent.
-- =====================================================================
DROP POLICY IF EXISTS authenticated_all_domestic_services ON public.domestic_services;

DROP POLICY IF EXISTS domestic_select ON public.domestic_services;
CREATE POLICY domestic_select ON public.domestic_services FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

DROP POLICY IF EXISTS domestic_insert ON public.domestic_services;
CREATE POLICY domestic_insert ON public.domestic_services FOR INSERT WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

-- =====================================================================
-- properties — staging had ONLY the wide-open policy; zero org scoping
-- or role gating existed for this table until now. Biggest real gap found.
-- =====================================================================
DROP POLICY IF EXISTS authenticated_all_properties ON public.properties;

DROP POLICY IF EXISTS properties_select ON public.properties;
CREATE POLICY properties_select ON public.properties FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

DROP POLICY IF EXISTS properties_modify ON public.properties;
CREATE POLICY properties_modify ON public.properties FOR ALL USING (
	auth.role() = 'authenticated' AND is_org_admin(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND is_org_admin(org_id)
);

-- =====================================================================
-- tasks — drop redundant wide-open; add missing select (modify already
-- correct from 080).
-- =====================================================================
DROP POLICY IF EXISTS authenticated_all_tasks ON public.tasks;

DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

-- =====================================================================
-- user_profiles — legacy/unused table (see README "ACTIVE INCIDENT" — the
-- real role table is public.profiles). Tightening this anyway for
-- consistency with the rest of this migration, same reasoning as
-- domestic_services; low-stakes either way since nothing reads this table.
-- =====================================================================
DROP POLICY IF EXISTS authenticated_all_user_profiles ON public.user_profiles;

DROP POLICY IF EXISTS user_profiles_select ON public.user_profiles;
CREATE POLICY user_profiles_select ON public.user_profiles FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

DROP POLICY IF EXISTS user_profiles_insert ON public.user_profiles;
CREATE POLICY user_profiles_insert ON public.user_profiles FOR INSERT WITH CHECK (
	auth.role() = 'authenticated' AND (is_org_admin(org_id) OR role = 'owner')
);

DROP POLICY IF EXISTS user_profiles_update ON public.user_profiles;
CREATE POLICY user_profiles_update ON public.user_profiles FOR UPDATE USING (
	auth.role() = 'authenticated' AND is_org_admin(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND is_org_admin(org_id)
);

-- =====================================================================
-- property_users — staging had ONLY the wide-open policy; ported from
-- production's actual current policy text, EXCEPT property_users_modify's
-- EXISTS subquery, which referenced public.user_profiles (the same wrong/
-- legacy table from the "ACTIVE INCIDENT" note — pre-existing on
-- production before any of this, not introduced here). Now that
-- public.profiles' columns are confirmed (id = auth.uid() directly, no
-- separate user_id), corrected to join against profiles instead. The join
-- is redundant with is_org_admin()'s own internal profiles check, but kept
-- for a minimal diff from prod's original intent.
-- =====================================================================
DROP POLICY IF EXISTS authenticated_all_property_users ON public.property_users;

DROP POLICY IF EXISTS property_users_select ON public.property_users;
CREATE POLICY property_users_select ON public.property_users FOR SELECT USING (
	auth.role() = 'authenticated' AND property_id IN (
		SELECT p.id FROM public.properties p WHERE p.org_id = current_org_id()
	)
);

DROP POLICY IF EXISTS property_users_modify ON public.property_users;
CREATE POLICY property_users_modify ON public.property_users FOR ALL USING (
	auth.role() = 'authenticated' AND EXISTS (
		SELECT 1 FROM public.properties p
		JOIN public.profiles u ON u.org_id = p.org_id AND u.id = auth.uid()
		WHERE p.id = property_users.property_id AND is_org_admin(p.org_id)
	)
) WITH CHECK (
	auth.role() = 'authenticated' AND EXISTS (
		SELECT 1 FROM public.properties p
		JOIN public.profiles u ON u.org_id = p.org_id AND u.id = auth.uid()
		WHERE p.id = property_users.property_id AND is_org_admin(p.org_id)
	)
);

-- =====================================================================
-- financial_transactions — production uses JWT custom claims; using the
-- helper-function equivalent instead (see header note #2).
-- =====================================================================
DROP POLICY IF EXISTS authenticated_all_financial_transactions ON public.financial_transactions;

DROP POLICY IF EXISTS financial_transactions_select ON public.financial_transactions;
CREATE POLICY financial_transactions_select ON public.financial_transactions FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

DROP POLICY IF EXISTS financial_transactions_modify ON public.financial_transactions;
CREATE POLICY financial_transactions_modify ON public.financial_transactions FOR ALL USING (
	auth.role() = 'authenticated' AND is_org_admin(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND is_org_admin(org_id)
);

-- =====================================================================
-- ical_feeds — production uses JWT custom claims; using the helper-
-- function equivalent instead (see header note #2). service_role select
-- is a plain role check (not a JWT claim), so ported verbatim — needed
-- for api/speranta-cal.js and api/tvhouse-cal.js, which now read via
-- SUPABASE_SERVICE_ROLE_KEY.
-- =====================================================================
DROP POLICY IF EXISTS authenticated_all_ical_feeds ON public.ical_feeds;

DROP POLICY IF EXISTS ical_feeds_select ON public.ical_feeds;
CREATE POLICY ical_feeds_select ON public.ical_feeds FOR SELECT USING (
	auth.role() = 'authenticated' AND is_org_admin(org_id)
);

DROP POLICY IF EXISTS ical_feeds_modify ON public.ical_feeds;
CREATE POLICY ical_feeds_modify ON public.ical_feeds FOR ALL USING (
	auth.role() = 'authenticated' AND is_org_admin(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND is_org_admin(org_id)
);

DROP POLICY IF EXISTS service_role_select_all ON public.ical_feeds;
CREATE POLICY service_role_select_all ON public.ical_feeds FOR SELECT USING (
	auth.role() = 'service_role'
);

-- =====================================================================
-- invoices — production's "narrow" policy hardcodes prod's own literal
-- org_id UUID, which doesn't exist in staging (see header note #3).
-- Using current_org_id() instead.
-- =====================================================================
DROP POLICY IF EXISTS authenticated_all_invoices ON public.invoices;

DROP POLICY IF EXISTS invoices_org_all ON public.invoices;
CREATE POLICY invoices_org_all ON public.invoices FOR ALL USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

-- =====================================================================
-- property_inspections — production's narrow policies hardcode prod's own
-- literal org_id UUID (see header note #3), and are additionally
-- shadowed by bare-true wide-open ones. Using current_org_id() instead;
-- no admin/host gate, since prod's own narrow versions didn't require one.
-- =====================================================================
DROP POLICY IF EXISTS authenticated_all_property_inspections ON public.property_inspections;

DROP POLICY IF EXISTS property_inspections_select ON public.property_inspections;
CREATE POLICY property_inspections_select ON public.property_inspections FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

DROP POLICY IF EXISTS property_inspections_insert ON public.property_inspections;
CREATE POLICY property_inspections_insert ON public.property_inspections FOR INSERT WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

DROP POLICY IF EXISTS property_inspections_update ON public.property_inspections;
CREATE POLICY property_inspections_update ON public.property_inspections FOR UPDATE USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

-- End 100_rls_parity.
