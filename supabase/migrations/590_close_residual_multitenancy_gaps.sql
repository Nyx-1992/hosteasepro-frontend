-- 590_close_residual_multitenancy_gaps.sql
-- Runs on BOTH databases. Already APPLIED directly via the Supabase MCP
-- connector on 2026-07-29 (same session as 570/580); documents it for the
-- repo record.
--
-- Found while spot-checking with the "test" org after 570/580: the org
-- still saw S&N's bookings on its Dashboard. Root cause was NOT a gap in
-- bookings_select/domestics_authenticated_org_scoped themselves — those
-- were correct. It was that several OTHER, differently-named policies on
-- the same tables had qual/with_check = true with NO role restriction at
-- all (not even a check for auth.role() = 'anon' despite the policy
-- names implying anon-only). Postgres RLS policies are OR'd together, so
-- a single unconditional policy on a table silently defeats every other,
-- more careful policy on that same table. This is a different bug class
-- from 570/580 (missing/absent org check) — here the org-scoped policy
-- existed correctly, but a sibling policy bypassed it entirely.

-- =====================================================================
-- 1. bookings.anon_select_bookings_for_domestic and domestics'
--    anon_domestics_select/insert/update — restrict to the anon role
--    they were named for. domestic.html's cleaner/Nina flows are always
--    anon (verified by code audit in 580), so this costs no legitimate
--    functionality; it only removes the accidental blanket grant to
--    authenticated users of every other org.
-- =====================================================================
DROP POLICY IF EXISTS anon_select_bookings_for_domestic ON public.bookings;
CREATE POLICY anon_select_bookings_for_domestic ON public.bookings FOR SELECT USING (auth.role() = 'anon');

DROP POLICY IF EXISTS anon_domestics_select ON public.domestics;
CREATE POLICY anon_domestics_select ON public.domestics FOR SELECT USING (auth.role() = 'anon');
DROP POLICY IF EXISTS anon_domestics_insert ON public.domestics;
CREATE POLICY anon_domestics_insert ON public.domestics FOR INSERT WITH CHECK (auth.role() = 'anon');
DROP POLICY IF EXISTS anon_domestics_update ON public.domestics;
CREATE POLICY anon_domestics_update ON public.domestics FOR UPDATE USING (auth.role() = 'anon') WITH CHECK (auth.role() = 'anon');

-- =====================================================================
-- 2. financial_transactions / ical_feeds — production-only leftover
--    policies from the old custom-JWT-claim auth mechanism (see
--    100_rls_parity.sql's header notes), never cleaned up because they
--    have different names than what that migration's DROP POLICY list
--    targeted. financial_tx_admin_all was the worst: ANY user whose JWT
--    carries a role:admin claim got full read/write across every org's
--    financial data, no org check at all. The correct narrow policies
--    (financial_transactions_select/_modify, ical_feeds_select/_modify)
--    already exist and cover legitimate access.
-- =====================================================================
DROP POLICY IF EXISTS financial_tx_admin_all ON public.financial_transactions;
DROP POLICY IF EXISTS financial_tx_select_org ON public.financial_transactions;
DROP POLICY IF EXISTS modify_financial_transactions ON public.financial_transactions;
DROP POLICY IF EXISTS select_financial_transactions ON public.financial_transactions;
DROP POLICY IF EXISTS modify_ical_feeds ON public.ical_feeds;
DROP POLICY IF EXISTS select_ical_feeds ON public.ical_feeds;

-- =====================================================================
-- 3. booking_audit — already had an org_id column (fully backfilled on
--    both databases, no ADD COLUMN/UPDATE needed), just no org check in
--    its policy. Not written to directly by any client code (grep
--    confirmed) — populated by a trigger/definer path, so tightening
--    this doesn't risk breaking any insert flow.
-- =====================================================================
DROP POLICY IF EXISTS authenticated_all_booking_audit ON public.booking_audit;
CREATE POLICY booking_audit_authenticated_org_scoped ON public.booking_audit FOR ALL USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

-- =====================================================================
-- NOT done here — found in the same full-policy sweep, still open,
-- deliberately deferred (each needs ADD COLUMN org_id + backfill +
-- client-code updates, same shape as domestics/cleaner_availability in
-- 580, not a quick policy edit):
--   finance_transactions  (owner management-fee notes — financial)
--   monthly_earnings      (financial)
--   kb_articles           (Knowledge Base — may include door/alarm codes)
--   import_runs           (sync run metadata — lower stakes)
--   domestic_services_detailed (possibly unused legacy table — verify
--                          usage before spending effort here)
-- Also noted, lower urgency: organizations.org_write lets any
-- authenticated user modify ANY org's row (name-only in practice, real
-- org creation goes through api/create-org.js's service-role path which
-- bypasses RLS anyway) — narrow this if/when it's convenient, not urgent.
-- =====================================================================

-- End 590_close_residual_multitenancy_gaps.
