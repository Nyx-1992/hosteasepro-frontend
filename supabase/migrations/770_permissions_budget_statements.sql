-- 770_permissions_budget_statements.sql
-- Runs on BOTH databases.
--
-- Finishes what 750 started. That migration added has_permission() and a
-- toggle grid covering five permissions, but only wired site_content's
-- policies to it. budget.view / budget.edit / statements.upload were
-- honoured by the UI and ignored by the database — so the grid told a
-- half-truth: unticking them hid buttons without actually refusing
-- anything, and a determined non-admin could still have written through
-- the API. A permission screen that is only advisory is worse than none,
-- because it is believed.
--
-- Shape is identical to 750's: `is_org_admin(org) OR has_permission(...)`.
-- Admins therefore keep unconditional access and the org can always be
-- administered; the toggles only ever WIDEN access to non-admin roles,
-- never narrow an admin's. Owners short-circuit inside has_permission()
-- and cannot lock themselves out.
--
-- Tables covered:
--   business_budget, pricing_plans      -> budget.view / budget.edit
--   finance_documents                   -> statements.upload
--   platform_earnings, platform_statement_lines
--                                       -> statements.upload
--
-- finance_documents holds scanned invoices as well as platform
-- statements, so 'statements.upload' is doing slightly more than its
-- name suggests: granting it lets a role manage finance documents
-- generally. Splitting it would mean a second permission for a
-- distinction nobody has asked for yet; noted here so the name is not
-- mistaken for a narrower grant than it is.

-- ── business_budget ──
DROP POLICY IF EXISTS business_budget_select ON public.business_budget;
CREATE POLICY business_budget_select ON public.business_budget FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'budget.view'))
);

DROP POLICY IF EXISTS business_budget_insert ON public.business_budget;
CREATE POLICY business_budget_insert ON public.business_budget FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'budget.edit'))
);

DROP POLICY IF EXISTS business_budget_update ON public.business_budget;
CREATE POLICY business_budget_update ON public.business_budget FOR UPDATE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'budget.edit'))
) WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'budget.edit'))
);

DROP POLICY IF EXISTS business_budget_delete ON public.business_budget;
CREATE POLICY business_budget_delete ON public.business_budget FOR DELETE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'budget.edit'))
);

-- ── pricing_plans ── (the price list is part of the budget picture)
DROP POLICY IF EXISTS pricing_plans_select ON public.pricing_plans;
CREATE POLICY pricing_plans_select ON public.pricing_plans FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'budget.view'))
);

DROP POLICY IF EXISTS pricing_plans_insert ON public.pricing_plans;
CREATE POLICY pricing_plans_insert ON public.pricing_plans FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'budget.edit'))
);

DROP POLICY IF EXISTS pricing_plans_update ON public.pricing_plans;
CREATE POLICY pricing_plans_update ON public.pricing_plans FOR UPDATE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'budget.edit'))
) WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'budget.edit'))
);

DROP POLICY IF EXISTS pricing_plans_delete ON public.pricing_plans;
CREATE POLICY pricing_plans_delete ON public.pricing_plans FOR DELETE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'budget.edit'))
);

-- ── finance_documents ──
DROP POLICY IF EXISTS finance_documents_select ON public.finance_documents;
CREATE POLICY finance_documents_select ON public.finance_documents FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'statements.upload'))
);

DROP POLICY IF EXISTS finance_documents_insert ON public.finance_documents;
CREATE POLICY finance_documents_insert ON public.finance_documents FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'statements.upload'))
);

DROP POLICY IF EXISTS finance_documents_update ON public.finance_documents;
CREATE POLICY finance_documents_update ON public.finance_documents FOR UPDATE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'statements.upload'))
) WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'statements.upload'))
);

DROP POLICY IF EXISTS finance_documents_delete ON public.finance_documents;
CREATE POLICY finance_documents_delete ON public.finance_documents FOR DELETE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'statements.upload'))
);

-- ── platform_earnings ──
DROP POLICY IF EXISTS platform_earnings_select ON public.platform_earnings;
CREATE POLICY platform_earnings_select ON public.platform_earnings FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'statements.upload'))
);

DROP POLICY IF EXISTS platform_earnings_insert ON public.platform_earnings;
CREATE POLICY platform_earnings_insert ON public.platform_earnings FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'statements.upload'))
);

DROP POLICY IF EXISTS platform_earnings_update ON public.platform_earnings;
CREATE POLICY platform_earnings_update ON public.platform_earnings FOR UPDATE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'statements.upload'))
) WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'statements.upload'))
);

DROP POLICY IF EXISTS platform_earnings_delete ON public.platform_earnings;
CREATE POLICY platform_earnings_delete ON public.platform_earnings FOR DELETE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'statements.upload'))
);

-- ── platform_statement_lines ──
DROP POLICY IF EXISTS platform_statement_lines_select ON public.platform_statement_lines;
CREATE POLICY platform_statement_lines_select ON public.platform_statement_lines FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'statements.upload'))
);

DROP POLICY IF EXISTS platform_statement_lines_insert ON public.platform_statement_lines;
CREATE POLICY platform_statement_lines_insert ON public.platform_statement_lines FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'statements.upload'))
);

DROP POLICY IF EXISTS platform_statement_lines_delete ON public.platform_statement_lines;
CREATE POLICY platform_statement_lines_delete ON public.platform_statement_lines FOR DELETE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'statements.upload'))
);

-- End 770_permissions_budget_statements.
