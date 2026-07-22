-- 520_team_contacts.sql
-- Runs on BOTH databases.
--
-- New table backing the Team tab's contact directory (management/domestic
-- staff/maintenance/suppliers/security/other), replacing the hardcoded
-- BUILTIN_CONTACTS array + browser-localStorage-only custom contacts in
-- demo/index_fixed.html. Neither of those was editable in-app (no edit
-- button ever existed) and localStorage entries never synced between
-- Nicole's and Silja's devices — this table fixes both.
--
-- Named `team_contacts`, not `contacts` — this app already has an unused
-- public.contacts table (001_init_core_schema.sql) shaped for a future
-- guest/owner/agent CRM (first_name/last_name/company/type). That table
-- has its own RLS incident history (see 085's header) and is never queried
-- by the live app today; this migration does not touch it.
--
-- sub_contacts holds zero or more "personal contact at this entry" objects,
-- e.g. WeatherProfe's front-desk contact Heather:
--   [{"name":"Heather","role":"Front Desk","phone":"083 445 6126","email":"","wa":""}]
-- (needed for entries like a letting agent with several people attached).
--
-- sensitive marks an entry (e.g. a private banker) as compact-by-default in
-- the UI — card shows only name/category until an admin clicks to expand.
-- Not an access-control mechanism; Team tab access itself is already
-- admin-only (see the RLS policies below), this is just reduced visibility
-- on a shared screen.

CREATE TABLE IF NOT EXISTS public.team_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cat text NOT NULL DEFAULT 'other' CHECK (cat IN ('management','domestic','maintenance','supplier','security','other')),
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  wa text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  initials text NOT NULL DEFAULT '',
  sub_contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  sensitive boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_contacts_org_id_idx ON public.team_contacts (org_id);

CREATE OR REPLACE FUNCTION public.team_contacts_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_contacts_updated_at ON public.team_contacts;
CREATE TRIGGER team_contacts_updated_at
BEFORE UPDATE ON public.team_contacts
FOR EACH ROW EXECUTE FUNCTION public.team_contacts_updated_at();

ALTER TABLE public.team_contacts ENABLE ROW LEVEL SECURITY;

-- Any authenticated org member can read the directory (Nina needs phone
-- numbers on mobile too), but only owner/admin can add/edit/remove entries —
-- matches the Team tab's existing nav gate (roles:['owner','admin']) and
-- the user's explicit request that this be admin-editable, not open to
-- every role the way property_manuals/domestics are.
DROP POLICY IF EXISTS team_contacts_select ON public.team_contacts;
CREATE POLICY team_contacts_select ON public.team_contacts FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_member(org_id)
);

DROP POLICY IF EXISTS team_contacts_insert ON public.team_contacts;
CREATE POLICY team_contacts_insert ON public.team_contacts FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS team_contacts_update ON public.team_contacts;
CREATE POLICY team_contacts_update ON public.team_contacts FOR UPDATE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
) WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS team_contacts_delete ON public.team_contacts;
CREATE POLICY team_contacts_delete ON public.team_contacts FOR DELETE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

-- ── Seed: real data transcribed as-is from BUILTIN_CONTACTS
-- (demo/index_fixed.html) — nothing invented. sort_order preserves the
-- original array order within each category.

INSERT INTO public.team_contacts (org_id, cat, name, role, phone, email, wa, note, initials, sub_contacts, sort_order) VALUES
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'management', 'Nicole Babczyk', 'Co-Owner / Admin', '+27 63 602 1847', 'sn_apt_management@outlook.com', '+27636021847', 'Co-founder S&N Apt Management. Manages bookings, finances & operations.', 'N', '[]'::jsonb, 1),
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'management', 'Silja Faltin', 'Co-Owner / Admin', '', 's.faltin@tischlerei-faltin.de', '', 'Co-founder. TV House owner liaison.', 'S', '[]'::jsonb, 2),
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'management', 'Nina Williams', 'Host Expert', '+27 79 977 9455', 'vanwyk.nina@gmail.com', '+27636021847', 'On-ground host manager. Business WhatsApp for all guest contact.', 'NW', '[]'::jsonb, 3),
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'domestic', 'Blessing', 'Cleaner — Speranta', '062 532 2932', '', '27625322932', 'Paid via ewallet directly. Rate: R350/clean.', 'BL', '[]'::jsonb, 1),
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'domestic', 'Fatima', 'Cleaner — Both properties', '063 175 8111', '', '27631758111', 'Covers both properties. R350 Speranta / R450 TV House.', 'FA', '[]'::jsonb, 2),
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'domestic', 'Patricia Mutizwa', 'Cleaner — TV House', '063 735 3892', '', '27637353892', 'Primary TV House cleaner. EFT payment. R350 Speranta / R450 TV House.', 'PM', '[]'::jsonb, 3),
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'domestic', 'Spiwe Gwingwizna', 'Cleaner — Speranta', '084 915 0894', '', '27849150894', 'Speranta cleaner. Ewallet payment. R350/clean.', 'SP', '[]'::jsonb, 4),
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'domestic', 'Takudzwa Dumbura', 'Caretaker (Tino)', '', '', '', 'Lives in TV House granny flat with wife Keithy. Born 13 July 1996.', 'TI', '[]'::jsonb, 5),
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'domestic', 'Keithy Ngwenya', 'Caretaker''s Wife', '', '', '', 'Lives in TV House granny flat. Born 9 February 1997.', 'KE', '[]'::jsonb, 6),
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'maintenance', 'Pool Service', 'Swimming Pool Maintenance', '', '', '', 'Contact details TBC. Add pool service provider here.', '🏊', '[]'::jsonb, 1),
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'supplier', 'WeatherProfe Paint Shop', 'Paint Supplier', '', '', '', 'Personal contact: Heather, front desk.', 'WP', '[{"name":"Heather","role":"Front Desk","phone":"083 445 6126","email":""}]'::jsonb, 1),
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'supplier', 'Drop Along Plumbing', 'Plumbing Contractor', '', '', '', 'Trusted plumbing contractor.', 'DA', '[{"name":"Francois van Wyk","role":"Personal Contact","phone":"084 075 4684","email":"francois@ldrop.co.za","wa":"27840754684"}]'::jsonb, 2)
ON CONFLICT DO NOTHING;

-- End 520_team_contacts.
