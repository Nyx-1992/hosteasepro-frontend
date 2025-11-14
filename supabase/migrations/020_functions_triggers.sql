-- 020_functions_triggers.sql
-- All procedural objects: functions + triggers (no policies).
-- Ordered so dependent tables exist (from 001) and indexes (010) are not required here.

-- =====================================================================
-- Generic updated_at touch helpers
-- =====================================================================
CREATE OR REPLACE FUNCTION public.touch_org_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER org_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.touch_org_updated_at();

CREATE OR REPLACE FUNCTION public.touch_properties_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.touch_properties_updated_at();

CREATE OR REPLACE FUNCTION public.touch_bookings_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.touch_bookings_updated_at();

CREATE OR REPLACE FUNCTION public.touch_booking_checklists_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER booking_checklists_updated_at BEFORE UPDATE ON public.booking_checklists FOR EACH ROW EXECUTE FUNCTION public.touch_booking_checklists_updated_at();

CREATE OR REPLACE FUNCTION public.touch_contacts_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.touch_contacts_updated_at();

CREATE OR REPLACE FUNCTION public.touch_domestic_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER domestic_updated_at BEFORE UPDATE ON public.domestic_services FOR EACH ROW EXECUTE FUNCTION public.touch_domestic_updated_at();

CREATE OR REPLACE FUNCTION public.touch_tasks_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.touch_tasks_updated_at();

CREATE OR REPLACE FUNCTION public.touch_financial_transactions_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER financial_transactions_updated_at BEFORE UPDATE ON public.financial_transactions FOR EACH ROW EXECUTE FUNCTION public.touch_financial_transactions_updated_at();

CREATE OR REPLACE FUNCTION public.touch_ical_feeds_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER ical_feeds_updated_at BEFORE UPDATE ON public.ical_feeds FOR EACH ROW EXECUTE FUNCTION public.touch_ical_feeds_updated_at();

CREATE OR REPLACE FUNCTION public.touch_system_settings_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.touch_system_settings_updated_at();

CREATE OR REPLACE FUNCTION public.touch_user_profiles_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_user_profiles_updated_at();

-- =====================================================================
-- Bookings domain functions & triggers
-- =====================================================================
CREATE OR REPLACE FUNCTION public.calc_nights() RETURNS trigger AS $$
BEGIN
	IF NEW.check_in IS NOT NULL AND NEW.check_out IS NOT NULL THEN
		NEW.nights = GREATEST(1, DATE_PART('day', NEW.check_out - NEW.check_in));
	END IF;
	RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS bookings_calc_nights ON public.bookings;
CREATE TRIGGER bookings_calc_nights BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.calc_nights();

CREATE OR REPLACE FUNCTION public.normalize_booking_times() RETURNS trigger AS $$
DECLARE
	in_time time := (NEW.check_in AT TIME ZONE 'UTC')::time;
	out_time time := (NEW.check_out AT TIME ZONE 'UTC')::time;
BEGIN
	IF in_time = '00:00:00' THEN NEW.check_in := date_trunc('day', NEW.check_in) + INTERVAL '14 hours'; END IF;
	IF out_time = '00:00:00' THEN NEW.check_out := date_trunc('day', NEW.check_out) + INTERVAL '10 hours'; END IF;
	IF NEW.check_out <= NEW.check_in THEN RAISE EXCEPTION 'check_out (%) must be after check_in (%)', NEW.check_out, NEW.check_in; END IF;
	RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS bookings_normalize_times ON public.bookings;
CREATE TRIGGER bookings_normalize_times BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.normalize_booking_times();

CREATE OR REPLACE FUNCTION public.create_booking_checklist_if_ready() RETURNS trigger AS $$
BEGIN
	IF NEW.org_id IS NOT NULL AND NEW.property_id IS NOT NULL THEN
		INSERT INTO public.booking_checklists (booking_id, org_id, property_id)
		VALUES (NEW.id, NEW.org_id, NEW.property_id)
		ON CONFLICT (booking_id) DO NOTHING;
	END IF;
	RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS bookings_create_checklist ON public.bookings;
CREATE TRIGGER bookings_create_checklist AFTER INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.create_booking_checklist_if_ready();

CREATE OR REPLACE FUNCTION public.assign_booking_org_property() RETURNS trigger AS $$
DECLARE v_org uuid; v_prop uuid; BEGIN
	IF NEW.org_id IS NULL THEN SELECT id INTO v_org FROM public.organizations ORDER BY created_at LIMIT 1; IF v_org IS NOT NULL THEN NEW.org_id := v_org; END IF; END IF;
	IF NEW.property_id IS NULL AND NEW.property_name IS NOT NULL AND NEW.org_id IS NOT NULL THEN
		SELECT id INTO v_prop FROM public.properties WHERE org_id = NEW.org_id AND name = NEW.property_name LIMIT 1;
		IF v_prop IS NULL THEN
			INSERT INTO public.properties (id, org_id, name, status)
			VALUES (gen_random_uuid(), NEW.org_id, NEW.property_name, 'active') RETURNING id INTO v_prop;
		END IF;
		NEW.property_id := v_prop;
	END IF;
	RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS bookings_assign_org_property ON public.bookings;
CREATE TRIGGER bookings_assign_org_property BEFORE INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.assign_booking_org_property();

CREATE OR REPLACE FUNCTION public.sync_guest_name() RETURNS trigger AS $$
DECLARE combined text; BEGIN
	IF NEW.guest_name IS NOT NULL AND (NEW.guest_first_name IS NULL AND NEW.guest_last_name IS NULL) THEN
		NEW.guest_first_name := split_part(NEW.guest_name, ' ', 1);
		IF position(' ' IN NEW.guest_name) > 0 THEN
			NEW.guest_last_name := substr(NEW.guest_name, length(NEW.guest_first_name) + 2);
		END IF;
	END IF;
	IF NEW.guest_name IS NULL THEN
		combined := trim(coalesce(NEW.guest_first_name,'') || ' ' || coalesce(NEW.guest_last_name,''));
		IF combined <> '' THEN NEW.guest_name := combined; END IF;
	END IF;
	RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS bookings_sync_guest_name ON public.bookings;
CREATE TRIGGER bookings_sync_guest_name BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.sync_guest_name();

-- =====================================================================
-- Contacts auto-assign convenience
-- =====================================================================
CREATE OR REPLACE FUNCTION public.assign_contact_org() RETURNS trigger AS $$
DECLARE v_org uuid; BEGIN
	IF NEW.org_id IS NULL THEN
		SELECT id INTO v_org FROM public.organizations ORDER BY created_at LIMIT 1;
		IF v_org IS NOT NULL THEN NEW.org_id := v_org; END IF;
	END IF;
	RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS contacts_assign_org ON public.contacts;
CREATE TRIGGER contacts_assign_org BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.assign_contact_org();

-- End of functions & triggers migration.
