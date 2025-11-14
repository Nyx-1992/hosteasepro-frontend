-- 010_indexes_constraints.sql
-- Secondary structural objects: indexes & (non-table) constraints only.
-- Safe to re-run due to IF NOT EXISTS or conditional guards.
-- Keep UNIQUE constraints defined in tables; do not duplicate here.

-- =====================================================================
-- properties indexes
-- =====================================================================
CREATE INDEX IF NOT EXISTS properties_org_id_idx ON public.properties(org_id);
CREATE INDEX IF NOT EXISTS properties_status_idx ON public.properties(status) WHERE status='active';

-- =====================================================================
-- bookings unique indexes (span + date-span)
-- =====================================================================
-- Prevent exact duplicate stay spans for same property/platform.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_unique_span
	ON public.bookings (org_id, property_id, platform, check_in, check_out);

-- Canonical date-span uniqueness for active statuses.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_unique_date_span
	ON public.bookings (org_id, property_id, platform, check_in_date, check_out_date)
	WHERE status IN ('pending','confirmed','checked-in','checked-out');

-- OPTIONAL overlap prevention (commented). Requires btree_gist extension.
-- CREATE EXTENSION IF NOT EXISTS btree_gist;
-- ALTER TABLE public.bookings
--   ADD COLUMN IF NOT EXISTS stay_range tsrange
--   GENERATED ALWAYS AS (tsrange(check_in, check_out, '[)')) STORED;
-- ALTER TABLE public.bookings
--   ADD CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
--     property_id WITH =,
--     platform WITH =,
--     stay_range WITH &&
--   ) WHERE (status IN ('pending','confirmed','checked-in'));

-- =====================================================================
-- booking_checklists indexes
-- =====================================================================
-- (Primary key already exists; add org/property composite if needed for reporting)
CREATE INDEX IF NOT EXISTS booking_checklists_org_property_idx
	ON public.booking_checklists(org_id, property_id);

-- =====================================================================
-- contacts indexes (includes partial unique)
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS contacts_org_email_unique
	ON public.contacts(org_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_org_id_idx ON public.contacts(org_id);
CREATE INDEX IF NOT EXISTS contacts_type_idx ON public.contacts(type);
CREATE INDEX IF NOT EXISTS contacts_active_idx ON public.contacts(is_active) WHERE is_active;

-- =====================================================================
-- domestic_services indexes
-- =====================================================================
CREATE INDEX IF NOT EXISTS domestic_services_property_date_idx ON public.domestic_services (property_id, service_date);
CREATE INDEX IF NOT EXISTS domestic_services_org_id_idx ON public.domestic_services (org_id);
CREATE INDEX IF NOT EXISTS domestic_services_booking_idx ON public.domestic_services (booking_id);
CREATE INDEX IF NOT EXISTS domestic_services_payment_status_idx ON public.domestic_services (payment_status);

-- =====================================================================
-- tasks indexes
-- =====================================================================
CREATE INDEX IF NOT EXISTS tasks_org_id_idx ON public.tasks(org_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);
CREATE INDEX IF NOT EXISTS tasks_task_date_idx ON public.tasks(task_date);
CREATE INDEX IF NOT EXISTS tasks_assigned_user_idx ON public.tasks(assigned_user_id);

-- =====================================================================
-- financial_transactions indexes
-- =====================================================================
CREATE INDEX IF NOT EXISTS financial_transactions_org_id_idx ON public.financial_transactions(org_id);
CREATE INDEX IF NOT EXISTS financial_transactions_property_id_idx ON public.financial_transactions(property_id);
CREATE INDEX IF NOT EXISTS financial_transactions_booking_id_idx ON public.financial_transactions(booking_id);
CREATE INDEX IF NOT EXISTS financial_transactions_txn_date_idx ON public.financial_transactions(txn_date);
CREATE INDEX IF NOT EXISTS financial_transactions_category_idx ON public.financial_transactions(category);
CREATE INDEX IF NOT EXISTS financial_transactions_search_idx ON public.financial_transactions USING GIN (to_tsvector('english', search_text));

-- =====================================================================
-- ical_feeds indexes
-- =====================================================================
-- Unique(org_id, property_id, platform) already in table; add activity filter index if desired.
CREATE INDEX IF NOT EXISTS ical_feeds_active_idx ON public.ical_feeds(is_active) WHERE is_active;

-- =====================================================================
-- system_settings indexes
-- =====================================================================
-- UNIQUE(org_id, key) already defined; add org_id filter index for faster scans.
CREATE INDEX IF NOT EXISTS system_settings_org_id_idx ON public.system_settings(org_id);

-- End of indexes/constraints migration.
