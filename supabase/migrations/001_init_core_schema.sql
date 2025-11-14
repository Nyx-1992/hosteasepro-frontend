-- 001_init_core_schema.sql
-- Forward-only initial schema creation: tables only (no triggers, functions, indexes, policies, views).
-- All supplemental objects go into subsequent migration files (010, 020, 030, 040...).
-- Use IF NOT EXISTS to allow idempotent application in fresh environments.

-- NOTE: If running on a database that already contains legacy versions, subsequent migrations
-- will reconcile differences (adding indexes, triggers, policies, views, helper functions).

-- =====================================================================
-- organizations
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name text NOT NULL UNIQUE,
	slug text GENERATED ALWAYS AS (lower(regexp_replace(name,'\s+','-','g'))) STORED UNIQUE,
	status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now()
);

-- =====================================================================
-- properties
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.properties (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
	name text NOT NULL,
	code text,
	status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
	type text CHECK (type IN ('apartment','house','studio','villa','cabin','other')),
	bedrooms int CHECK (bedrooms >= 0),
	bathrooms int CHECK (bathrooms >= 0),
	max_guests int CHECK (max_guests >= 0),
	timezone text DEFAULT 'UTC',
	address_line1 text,
	address_line2 text,
	city text,
	region text,
	country text,
	postal_code text,
	notes text,
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now(),
	UNIQUE(org_id, name),
	UNIQUE(org_id, code)
);

-- =====================================================================
-- bookings
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.bookings (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
	property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
	property_name text,
	platform text NOT NULL,
	guest_first_name text,
	guest_last_name text,
	guest_email text,
	guest_phone text,
	number_of_guests int DEFAULT 1 CHECK (number_of_guests > 0),
	check_in timestamptz NOT NULL,
	check_out timestamptz NOT NULL,
	nights int GENERATED ALWAYS AS (GREATEST(1, (DATE_PART('day', check_out - check_in)))) STORED,
	status text DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','checked-in','checked-out','cancelled','no-show')),
	base_amount numeric,
	cleaning_fee numeric DEFAULT 0,
	security_deposit numeric DEFAULT 0,
	taxes numeric DEFAULT 0,
	platform_fee numeric DEFAULT 0,
	total_amount numeric DEFAULT 0,
	currency text DEFAULT 'ZAR',
	payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending','partial','paid','refunded')),
	ical_event_id text,
	is_active boolean DEFAULT true,
	user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now(),
	check_in_date date GENERATED ALWAYS AS ((check_in AT TIME ZONE 'UTC')::date) STORED,
	check_out_date date GENERATED ALWAYS AS ((check_out AT TIME ZONE 'UTC')::date) STORED
);

-- =====================================================================
-- booking_checklists
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.booking_checklists (
	booking_id bigint PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
	org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
	property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
	domestic_booked_at timestamptz,
	guest_contacted_at timestamptz,
	checked_in_at timestamptz,
	checked_out_at timestamptz,
	review_written_at timestamptz,
	follow_up_sent_at timestamptz,
	notes text,
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now()
);

-- =====================================================================
-- contacts
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.contacts (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
	type text NOT NULL DEFAULT 'guest' CHECK (type IN ('guest','owner','supplier','cleaner','agent','other')),
	first_name text,
	last_name text,
	company text,
	email text,
	phone text,
	country text,
	notes text,
	is_active boolean NOT NULL DEFAULT true,
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now(),
	full_name text GENERATED ALWAYS AS (
		COALESCE(NULLIF(TRIM(first_name || ' ' || last_name),' '), company, email)
	) STORED
);

-- =====================================================================
-- domestic_services
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.domestic_services (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
	property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
	booking_id bigint NULL REFERENCES public.bookings(id) ON DELETE SET NULL,
	cleaner_id bigint,
	service_date date NOT NULL,
	service_type text NOT NULL CHECK (service_type IN ('cleaning','laundry','maintenance','other')),
	amount numeric NOT NULL CHECK (amount >= 0),
	currency text DEFAULT 'ZAR',
	payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','partial','refunded')),
	payment_date date,
	payment_method text,
	notes text,
	before_photos jsonb,
	after_photos jsonb,
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now(),
	user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
	is_associated_booking boolean GENERATED ALWAYS AS (booking_id IS NOT NULL) STORED
);

-- =====================================================================
-- tasks
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tasks (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
	property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
	booking_id bigint REFERENCES public.bookings(id) ON DELETE SET NULL,
	title text NOT NULL,
	description text,
	task_date date NOT NULL DEFAULT CURRENT_DATE,
	due_at timestamptz,
	status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
	type text NOT NULL DEFAULT 'cleaning' CHECK (type IN ('cleaning','maintenance','admin','other')),
	priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
	assigned_user_id uuid REFERENCES public.user_profiles(user_id) ON DELETE SET NULL,
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now()
);

-- =====================================================================
-- financial_transactions
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.financial_transactions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
	property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
	booking_id bigint REFERENCES public.bookings(id) ON DELETE SET NULL,
	contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
	txn_date date NOT NULL DEFAULT CURRENT_DATE,
	amount numeric(12,2) NOT NULL CHECK (amount <> 0),
	currency text NOT NULL DEFAULT 'EUR',
	direction text NOT NULL CHECK (direction IN ('income','expense')),
	method text CHECK (method IN ('bank_transfer','cash','card','online','other')),
	category text NOT NULL CHECK (category IN (
		'accommodation','cleaning_fee','service_fee','commission','maintenance','utilities','supplies','tax','other'
	)),
	description text,
	notes text,
	external_ref text,
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now(),
	search_text text GENERATED ALWAYS AS (
		lower(coalesce(description,'') || ' ' || coalesce(notes,'') || ' ' || coalesce(category,'') || ' ' || coalesce(external_ref,''))
	) STORED
);

-- =====================================================================
-- ical_feeds
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.ical_feeds (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
	property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
	platform text NOT NULL CHECK (platform IN ('airbnb','booking','lekkeslaap','fewo','other')),
	feed_url text NOT NULL,
	is_active boolean NOT NULL DEFAULT true,
	last_import_at timestamptz,
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now(),
	UNIQUE(org_id, property_id, platform)
);

-- =====================================================================
-- user_profiles
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
	user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
	org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
	role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','manager','member','viewer')),
	display_name text,
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now()
);

-- =====================================================================
-- system_settings (optional baseline)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
	key text NOT NULL,
	value jsonb NOT NULL DEFAULT '{}'::jsonb,
	description text,
	is_sensitive boolean NOT NULL DEFAULT false,
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now(),
	UNIQUE(org_id, key)
);

-- End of core schema definitions.
