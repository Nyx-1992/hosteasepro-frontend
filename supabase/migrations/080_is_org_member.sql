-- 080_is_org_member.sql
-- New helper: is_org_member — broader than is_org_admin (070_is_org_admin_fix.sql).
-- True for owner, admin, OR host. Use where hosts (not just owners/admins)
-- should be able to act on records, e.g. day-to-day booking/task/checklist
-- updates. SECURITY DEFINER + locked search_path from the start (see 070
-- for why).

CREATE OR REPLACE FUNCTION public.is_org_member(org uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_exists boolean; BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_profiles'
	) THEN RETURN FALSE; END IF;
	SELECT EXISTS (
		SELECT 1 FROM public.user_profiles p
		WHERE p.user_id = auth.uid() AND p.org_id = org AND p.role IN ('owner','admin','host')
	) INTO v_exists;
	RETURN COALESCE(v_exists, FALSE);
END; $$;

-- Widen day-to-day write policies from admin-only (is_org_admin) to any org
-- member (is_org_member). Re-created using the same drop+create convention
-- as 040_policies.sql (their USING/WITH CHECK clauses are otherwise
-- unchanged — only the role-check function call differs).

-- bookings
DROP POLICY IF EXISTS bookings_update ON public.bookings;
CREATE POLICY bookings_update ON public.bookings FOR UPDATE USING (
	auth.role() = 'authenticated' AND (org_id IS NULL OR org_id = public.current_org_id()) AND (org_id IS NULL OR public.is_org_member(org_id))
) WITH CHECK (
	auth.role() = 'authenticated' AND (org_id IS NULL OR org_id = public.current_org_id()) AND (org_id IS NULL OR public.is_org_member(org_id))
);

-- booking_checklists
DROP POLICY IF EXISTS booking_checklists_update ON public.booking_checklists;
CREATE POLICY booking_checklists_update ON public.booking_checklists FOR UPDATE USING (
	auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_member(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_member(org_id)
);

-- domestic_services — NOTE: the live staff/cleaner portal actually reads and
-- writes a table called `domestics`, not `domestic_services` (see
-- supabase/migrations/README.md, "Known schema drift"). `domestic_services`
-- appears unused/legacy. Updating its policy here for consistency with the
-- rest of this migration, but it does not affect the live cleaning-
-- assignment flow. See 100_rls_parity.sql for the actual `domestics` table.
DROP POLICY IF EXISTS domestic_update ON public.domestic_services;
CREATE POLICY domestic_update ON public.domestic_services FOR UPDATE USING (
	auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_member(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_member(org_id)
);

-- tasks
DROP POLICY IF EXISTS tasks_modify ON public.tasks;
CREATE POLICY tasks_modify ON public.tasks FOR ALL USING (
	auth.role() = 'authenticated' AND public.is_org_member(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND public.is_org_member(org_id)
);

-- contacts
DROP POLICY IF EXISTS contacts_modify ON public.contacts;
CREATE POLICY contacts_modify ON public.contacts FOR ALL USING (
	auth.role() = 'authenticated' AND public.is_org_member(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND public.is_org_member(org_id)
);

-- End 080_is_org_member.
