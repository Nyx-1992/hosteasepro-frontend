-- 680_staff_portal_pins.sql
-- Runs on BOTH databases.
--
-- Moves the staff portal's login list (demo/domestic.html's hardcoded
-- CLEANERS array: name/PIN/color/initials) into team_contacts, so portal
-- access is managed from the Staff tab like everything else — part of the
-- owner's "everything scalable, hardcode moves to Supabase" direction
-- (2026-07-30). Two deliberate improvements over parity with the array:
--
--   1. PINs no longer ship to every visitor in the page source — the
--      portal verifies a PIN server-side via staff_portal_login(), and
--      the login-grid RPC returns NO pin values at all.
--   2. Granting/revoking portal access or changing a PIN is a Staff tab
--      edit, not a code deploy.
--
-- PINs are stored plaintext. Considered hashing; rejected for now: a
-- 4-digit numeric space (10,000 values) is offline-brute-forceable in
-- milliseconds regardless of hash, so hashing adds operational pain with
-- no real protection. The actual boundary improvements are "not
-- world-readable in the HTML any more" and "checked server-side". No
-- rate limiting on staff_portal_login yet — follow-up if the portal ever
-- gates more than day-to-day cleaning workflow.
--
-- portal_color preserves each person's familiar avatar color from the
-- old array (cleaners find their button by color); NULL = client assigns
-- from its palette.
--
-- Backfill transcribes the shipped CLEANERS array as-is (guarded, so a
-- second run is a no-op). Nina Williams is cat='management' — coordinator
-- access (is_coordinator in the RPCs) derives from cat, no separate flag.

ALTER TABLE public.team_contacts
  ADD COLUMN IF NOT EXISTS portal_pin text,
  ADD COLUMN IF NOT EXISTS portal_color text;

DO $$ BEGIN
  ALTER TABLE public.team_contacts
    ADD CONSTRAINT team_contacts_portal_pin_format
    CHECK (portal_pin IS NULL OR portal_pin ~ '^[0-9]{4}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.team_contacts SET portal_pin = '0314', portal_color = '#f59e0b'
WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND cat = 'domestic' AND name LIKE 'Blessing%' AND portal_pin IS NULL;

UPDATE public.team_contacts SET portal_pin = '0722', portal_color = '#8b5cf6'
WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND cat = 'domestic' AND name LIKE 'Fatima%' AND portal_pin IS NULL;

UPDATE public.team_contacts SET portal_pin = '0828', portal_color = '#2dd4a0'
WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND cat = 'domestic' AND name LIKE 'Patricia%' AND portal_pin IS NULL;

UPDATE public.team_contacts SET portal_pin = '0918', portal_color = '#5b8ef0'
WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND cat = 'domestic' AND name LIKE 'Spiwe%' AND portal_pin IS NULL;

UPDATE public.team_contacts SET portal_pin = '7021', portal_color = '#6c47ff'
WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND cat = 'management' AND name LIKE 'Nina%' AND portal_pin IS NULL;

-- Who appears on the portal's login screen. NO pin values here.
-- Coordinator(s) last — the portal renders them as the full-width button
-- below the cleaner grid.
CREATE OR REPLACE FUNCTION public.get_staff_portal_logins()
RETURNS TABLE (
  name text,
  initials text,
  color text,
  is_coordinator boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT split_part(tc.name, ' ', 1),
         NULLIF(tc.initials, ''),
         tc.portal_color,
         tc.cat = 'management'
  FROM public.team_contacts tc
  WHERE tc.org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4'
    AND tc.portal_pin IS NOT NULL
  ORDER BY tc.cat = 'management', tc.sort_order;
$$;
GRANT EXECUTE ON FUNCTION public.get_staff_portal_logins() TO anon;

-- The PIN check — the ONLY anon-reachable path that reads portal_pin.
-- Empty result = wrong name/PIN pair; the client can't tell which, and
-- never sees any stored PIN.
CREATE OR REPLACE FUNCTION public.staff_portal_login(p_name text, p_pin text)
RETURNS TABLE (
  name text,
  initials text,
  color text,
  is_coordinator boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT split_part(tc.name, ' ', 1),
         NULLIF(tc.initials, ''),
         tc.portal_color,
         tc.cat = 'management'
  FROM public.team_contacts tc
  WHERE tc.org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4'
    AND tc.portal_pin IS NOT NULL
    AND split_part(tc.name, ' ', 1) = p_name
    AND tc.portal_pin = p_pin
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.staff_portal_login(text, text) TO anon;

-- End 680_staff_portal_pins.
