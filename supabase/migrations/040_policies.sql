-- 040_policies.sql
-- Enable RLS and create policies for all tenant-scoped tables.
-- Assumes helper functions in 030 are present.

-- organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_select ON public.organizations;
CREATE POLICY org_select ON public.organizations FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS org_write ON public.organizations;
CREATE POLICY org_write ON public.organizations FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- properties
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS properties_select ON public.properties;
CREATE POLICY properties_select ON public.properties FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = public.current_org_id()
);
DROP POLICY IF EXISTS properties_modify ON public.properties;
CREATE POLICY properties_modify ON public.properties FOR ALL USING (
	auth.role() = 'authenticated' AND public.is_org_admin(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND public.is_org_admin(org_id)
);

-- bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bookings_select ON public.bookings;
CREATE POLICY bookings_select ON public.bookings FOR SELECT USING (
	auth.role() = 'authenticated' AND (org_id IS NULL OR org_id = public.current_org_id())
);
DROP POLICY IF EXISTS bookings_insert ON public.bookings;
CREATE POLICY bookings_insert ON public.bookings FOR INSERT WITH CHECK (
	auth.role() = 'authenticated' AND (org_id IS NULL OR org_id = public.current_org_id())
);
DROP POLICY IF EXISTS bookings_update ON public.bookings;
CREATE POLICY bookings_update ON public.bookings FOR UPDATE USING (
	auth.role() = 'authenticated' AND (org_id IS NULL OR org_id = public.current_org_id()) AND (org_id IS NULL OR public.is_org_admin(org_id))
) WITH CHECK (
	auth.role() = 'authenticated' AND (org_id IS NULL OR org_id = public.current_org_id()) AND (org_id IS NULL OR public.is_org_admin(org_id))
);

-- booking_checklists
ALTER TABLE public.booking_checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_checklists_select ON public.booking_checklists;
CREATE POLICY booking_checklists_select ON public.booking_checklists FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = public.current_org_id()
);
DROP POLICY IF EXISTS booking_checklists_insert ON public.booking_checklists;
CREATE POLICY booking_checklists_insert ON public.booking_checklists FOR INSERT WITH CHECK (
	auth.role() = 'authenticated' AND org_id = public.current_org_id()
);
DROP POLICY IF EXISTS booking_checklists_update ON public.booking_checklists;
CREATE POLICY booking_checklists_update ON public.booking_checklists FOR UPDATE USING (
	auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

-- contacts
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contacts_select ON public.contacts;
CREATE POLICY contacts_select ON public.contacts FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = public.current_org_id()
);
DROP POLICY IF EXISTS contacts_modify ON public.contacts;
CREATE POLICY contacts_modify ON public.contacts FOR ALL USING (
	auth.role() = 'authenticated' AND public.is_org_admin(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND public.is_org_admin(org_id)
);

-- domestic_services
ALTER TABLE public.domestic_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS domestic_select ON public.domestic_services;
CREATE POLICY domestic_select ON public.domestic_services FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = public.current_org_id()
);
DROP POLICY IF EXISTS domestic_insert ON public.domestic_services;
CREATE POLICY domestic_insert ON public.domestic_services FOR INSERT WITH CHECK (
	auth.role() = 'authenticated' AND org_id = public.current_org_id()
);
DROP POLICY IF EXISTS domestic_update ON public.domestic_services;
CREATE POLICY domestic_update ON public.domestic_services FOR UPDATE USING (
	auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

-- tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = public.current_org_id()
);
DROP POLICY IF EXISTS tasks_modify ON public.tasks;
CREATE POLICY tasks_modify ON public.tasks FOR ALL USING (
	auth.role() = 'authenticated' AND public.is_org_admin(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND public.is_org_admin(org_id)
);

-- financial_transactions
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_transactions_select ON public.financial_transactions;
CREATE POLICY financial_transactions_select ON public.financial_transactions FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = public.current_org_id()
);
DROP POLICY IF EXISTS financial_transactions_modify ON public.financial_transactions;
CREATE POLICY financial_transactions_modify ON public.financial_transactions FOR ALL USING (
	auth.role() = 'authenticated' AND public.is_org_admin(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND public.is_org_admin(org_id)
);

-- ical_feeds (admin-only)
ALTER TABLE public.ical_feeds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ical_feeds_select ON public.ical_feeds;
CREATE POLICY ical_feeds_select ON public.ical_feeds FOR SELECT USING (
	auth.role() = 'authenticated' AND public.is_org_admin(org_id)
);
DROP POLICY IF EXISTS ical_feeds_modify ON public.ical_feeds;
CREATE POLICY ical_feeds_modify ON public.ical_feeds FOR ALL USING (
	auth.role() = 'authenticated' AND public.is_org_admin(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND public.is_org_admin(org_id)
);

-- user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_profiles_select ON public.user_profiles;
CREATE POLICY user_profiles_select ON public.user_profiles FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = public.current_org_id()
);
DROP POLICY IF EXISTS user_profiles_insert ON public.user_profiles;
CREATE POLICY user_profiles_insert ON public.user_profiles FOR INSERT WITH CHECK (
	auth.role() = 'authenticated' AND (public.is_org_admin(org_id) OR role = 'owner')
);
DROP POLICY IF EXISTS user_profiles_update ON public.user_profiles;
CREATE POLICY user_profiles_update ON public.user_profiles FOR UPDATE USING (
	auth.role() = 'authenticated' AND public.is_org_admin(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND public.is_org_admin(org_id)
);

-- system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_settings_select ON public.system_settings;
CREATE POLICY system_settings_select ON public.system_settings FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = public.current_org_id()
);
DROP POLICY IF EXISTS system_settings_modify ON public.system_settings;
CREATE POLICY system_settings_modify ON public.system_settings FOR ALL USING (
	auth.role() = 'authenticated' AND public.is_org_admin(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND public.is_org_admin(org_id)
);

-- End policies.
