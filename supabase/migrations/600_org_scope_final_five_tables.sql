-- 600_org_scope_final_five_tables.sql
-- Runs on BOTH databases. Already APPLIED directly via the Supabase MCP
-- connector on 2026-07-29 (same session as 570/580/590); repo record.
--
-- Closes the last five tables found in the full-policy audit that had no
-- org scoping for authenticated users: finance_transactions (owner
-- management-fee notes, 303 real rows on both databases — the one with
-- actual live data), kb_articles (Knowledge Base — client already sets
-- org_id on insert/update, just needed the column + policy), and three
-- effectively-unused legacy tables (monthly_earnings, import_runs,
-- domestic_services_detailed — zero rows, no client code references any
-- of them, closed for defense-in-depth rather than an active risk).
--
-- Same shape as 580: ADD COLUMN org_id (none of the five had it),
-- backfill existing rows to S&N's org, drop the org-blind policy,
-- replace with one requiring org_id = current_org_id(). A couple of
-- tables (monthly_earnings, domestic_services_detailed) turned out to
-- have their wide-open policy under a different name than assumed on
-- first pass (authenticated_all_monthly_earnings /
-- authenticated_all_domestic_services_detailed) — both DROP IF EXISTS
-- lists below cover every name attempted, so this file is idempotent.

ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
UPDATE public.finance_transactions SET org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' WHERE org_id IS NULL;
DROP POLICY IF EXISTS authenticated_all_finance ON public.finance_transactions;
CREATE POLICY finance_transactions_authenticated_org_scoped ON public.finance_transactions FOR ALL USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
UPDATE public.kb_articles SET org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' WHERE org_id IS NULL;
DROP POLICY IF EXISTS authenticated_all_kb_articles ON public.kb_articles;
CREATE POLICY kb_articles_authenticated_org_scoped ON public.kb_articles FOR ALL USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

ALTER TABLE public.monthly_earnings ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
UPDATE public.monthly_earnings SET org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' WHERE org_id IS NULL;
DROP POLICY IF EXISTS monthly_earnings_insert ON public.monthly_earnings;
DROP POLICY IF EXISTS monthly_earnings_select ON public.monthly_earnings;
DROP POLICY IF EXISTS monthly_earnings_update ON public.monthly_earnings;
DROP POLICY IF EXISTS authenticated_all_monthly_earnings ON public.monthly_earnings;
CREATE POLICY monthly_earnings_authenticated_org_scoped ON public.monthly_earnings FOR ALL USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

ALTER TABLE public.import_runs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
UPDATE public.import_runs SET org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' WHERE org_id IS NULL;
DROP POLICY IF EXISTS authenticated_all_import_runs ON public.import_runs;
CREATE POLICY import_runs_authenticated_org_scoped ON public.import_runs FOR ALL USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

ALTER TABLE public.domestic_services_detailed ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
UPDATE public.domestic_services_detailed SET org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' WHERE org_id IS NULL;
DROP POLICY IF EXISTS domestic_detailed_insert ON public.domestic_services_detailed;
DROP POLICY IF EXISTS domestic_detailed_select ON public.domestic_services_detailed;
DROP POLICY IF EXISTS domestic_detailed_update ON public.domestic_services_detailed;
DROP POLICY IF EXISTS authenticated_all_domestic_services_detailed ON public.domestic_services_detailed;
CREATE POLICY domestic_services_detailed_authenticated_org_scoped ON public.domestic_services_detailed FOR ALL USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

-- Full-database audit after this migration turned up exactly two
-- remaining policies with no org check, both intentional:
--   bookings."Allow direct booking inserts" — roles scoped to {anon}
--     specifically (not public), WITH CHECK requires platform='direct'.
--     The public booking-widget insert path; correctly narrow already.
--   roadmap_state.roadmap_all — internal task-tracking notes, no
--     customer data, deliberately left as low-priority follow-up.

-- End 600_org_scope_final_five_tables.
