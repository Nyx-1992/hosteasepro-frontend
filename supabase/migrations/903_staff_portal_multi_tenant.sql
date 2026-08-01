-- 903_staff_portal_multi_tenant.sql
-- Runs on BOTH databases.
--
-- The staff portal only ever worked for one agency, and said so in six
-- places. demo/domestic.html had `const ORG_ID = '5966bc67-…'` and a PROPS
-- map holding S&N's two property UUIDs; the three SECURITY DEFINER
-- functions the portal calls before anyone signs in —
-- get_staff_portal_logins, get_staff_portal_roster and staff_portal_login
-- — each had that same uuid written into their WHERE clause.
--
-- So HEP handed every agency a link from the Settings page to a portal
-- that would show them S&N's cleaners and, if they could get past the PIN,
-- file their work into S&N's org. It blocks onboarding anyone who employs
-- cleaners, which is every agency HEP is sold to.
--
-- ══ WHY A KEY IN THE PATH ═════════════════════════════════════════
--
-- The portal has to know which agency it belongs to BEFORE anyone signs
-- in, because the sign-in screen is a list of that agency's staff to pick
-- from. There is no session to read it out of. Owner's choice (2026-08-01)
-- of three: /domestic/<key> in the path, rather than a subdomain per
-- agency (needs wildcard DNS and makes signup a manual DNS step) or a code
-- typed by a cleaner standing in a flat holding a phone.
--
-- The key is PERMANENT once issued. It goes into a WhatsApp message and
-- onto a phone's home screen, and neither can be recalled — the same
-- reasoning as property short keys in 894.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS portal_key text;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_portal_key_idx
  ON public.organizations (portal_key) WHERE portal_key IS NOT NULL;

COMMENT ON COLUMN public.organizations.portal_key IS
  'URL-safe identifier for this agency''s staff portal: /domestic/<portal_key>. Permanent once issued — it is shared over WhatsApp and installed on phones, so changing it breaks links nobody can reach to fix.';

-- ── Generating one ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.org_portal_slug(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  -- Lowercase, ASCII, hyphen-separated, no leading/trailing hyphen.
  SELECT NULLIF(trim(both '-' from
           regexp_replace(
             regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'),
             '-+', '-', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.set_org_portal_key()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE base text; candidate text; n int := 1;
BEGIN
  IF NEW.portal_key IS NOT NULL AND NEW.portal_key <> '' THEN RETURN NEW; END IF;
  base := coalesce(public.org_portal_slug(NEW.name), 'agency');
  candidate := base;
  -- Two agencies called "Cape Coast Properties" must not collide, and the
  -- second one signing up must not fail — it gets -2.
  WHILE EXISTS (SELECT 1 FROM public.organizations o
                 WHERE o.portal_key = candidate AND o.id IS DISTINCT FROM NEW.id) LOOP
    n := n + 1;
    candidate := base || '-' || n;
  END LOOP;
  NEW.portal_key := candidate;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS organizations_portal_key ON public.organizations;
CREATE TRIGGER organizations_portal_key
  BEFORE INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_org_portal_key();

UPDATE public.organizations o
   SET portal_key = coalesce(public.org_portal_slug(o.name), 'agency-' || left(o.id::text, 8))
 WHERE o.portal_key IS NULL;

-- ══ WHAT THE PORTAL MAY LEARN BEFORE SIGNING IN ═══════════════════
--
-- An anonymous visitor holding a key gets exactly what the sign-in screen
-- needs: the agency's name, and its properties so a clean can be filed
-- against one. Nothing else — no addresses, no bookings, no guests.
--
-- The key is semi-public by design: it is in a link sent over WhatsApp,
-- so treat it as identifying, never as a secret. It gates nothing on its
-- own; the PIN still does that, server-side.
CREATE OR REPLACE FUNCTION public.staff_portal_bootstrap(p_portal_key text)
RETURNS TABLE(org_id uuid, org_name text, properties jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.id,
         o.name,
         coalesce(
           (SELECT jsonb_object_agg(p.id::text,
                     jsonb_build_object('name', p.name,
                                        'short', coalesce(nullif(p.code, ''), p.name),
                                        'key',   p.short_key))
              FROM public.properties p
             WHERE p.org_id = o.id
               AND coalesce(p.status, 'active') <> 'archived'),
           '{}'::jsonb)
    FROM public.organizations o
   WHERE o.portal_key = lower(trim(coalesce(p_portal_key, '')))
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.staff_portal_bootstrap(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_portal_bootstrap(text) TO anon, authenticated;

COMMENT ON FUNCTION public.staff_portal_bootstrap(text) IS
  'Resolves a portal key to the agency the portal is serving. Returns no rows for an unknown key, which is what tells the page to show "ask your manager for your link" rather than a broken screen.';

-- ══ THE THREE SIGN-IN FUNCTIONS, NOW BY KEY ═══════════════════════
--
-- Same bodies, with the hardcoded uuid replaced by a lookup on the key.
CREATE OR REPLACE FUNCTION public.get_staff_portal_logins(p_portal_key text)
RETURNS TABLE(name text, initials text, color text, is_coordinator boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT split_part(tc.name, ' ', 1),
         NULLIF(tc.initials, ''),
         tc.portal_color,
         tc.cat = 'management'
    FROM public.team_contacts tc
    JOIN public.organizations o ON o.id = tc.org_id
   WHERE o.portal_key = lower(trim(coalesce(p_portal_key, '')))
     AND tc.portal_pin IS NOT NULL
   ORDER BY tc.cat = 'management', tc.sort_order;
$$;

CREATE OR REPLACE FUNCTION public.get_staff_portal_roster(p_portal_key text)
RETURNS TABLE(name text, properties text[], rate jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT split_part(tc.name, ' ', 1),
         COALESCE(tc.cleaner_properties, '{}'),
         tc.cleaner_rate
    FROM public.team_contacts tc
    JOIN public.organizations o ON o.id = tc.org_id
   WHERE o.portal_key = lower(trim(coalesce(p_portal_key, '')))
     AND tc.cat = 'domestic'
     AND tc.cleaner_rate IS NOT NULL
   ORDER BY tc.sort_order;
$$;

-- The PIN is still checked here rather than in the page, and a wrong key
-- now fails the same way a wrong PIN does — no rows, no explanation.
CREATE OR REPLACE FUNCTION public.staff_portal_login(p_portal_key text, p_name text, p_pin text)
RETURNS TABLE(name text, initials text, color text, is_coordinator boolean, org_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT split_part(tc.name, ' ', 1),
         NULLIF(tc.initials, ''),
         tc.portal_color,
         tc.cat = 'management',
         tc.org_id
    FROM public.team_contacts tc
    JOIN public.organizations o ON o.id = tc.org_id
   WHERE o.portal_key = lower(trim(coalesce(p_portal_key, '')))
     AND tc.portal_pin IS NOT NULL
     AND split_part(tc.name, ' ', 1) = p_name
     AND tc.portal_pin = p_pin
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_staff_portal_logins(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_staff_portal_roster(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_portal_login(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_portal_logins(text)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_portal_roster(text)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_portal_login(text, text, text)   TO anon, authenticated;

-- ══ THE OLD ZERO-ARGUMENT VERSIONS STAY, FOR NOW ══════════════════
--
-- Not for tidiness — for the phones. The portal registers a service worker
-- that caches its own shell, so a cleaner who has it installed keeps
-- running the OLD page until that cache turns over, and the old page calls
-- these by their old signatures. Dropping them today would sign four
-- people out of a portal they use every morning, with no error that means
-- anything to them.
--
-- They are wrappers now, so S&N's org id appears exactly once in this
-- schema instead of three times, immediately below a note saying it is
-- legacy. Delete this block once every cleaner is on a /domestic/<key>
-- link — the Settings page hands out nothing else.
CREATE OR REPLACE FUNCTION public.get_staff_portal_logins()
RETURNS TABLE(name text, initials text, color text, is_coordinator boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT * FROM public.get_staff_portal_logins(
    (SELECT portal_key FROM public.organizations
      WHERE id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4'));  -- LEGACY, see above
$$;

CREATE OR REPLACE FUNCTION public.get_staff_portal_roster()
RETURNS TABLE(name text, properties text[], rate jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT * FROM public.get_staff_portal_roster(
    (SELECT portal_key FROM public.organizations
      WHERE id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4'));  -- LEGACY, see above
$$;

CREATE OR REPLACE FUNCTION public.staff_portal_login(p_name text, p_pin text)
RETURNS TABLE(name text, initials text, color text, is_coordinator boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.name, l.initials, l.color, l.is_coordinator
    FROM public.staff_portal_login(
           (SELECT portal_key FROM public.organizations
             WHERE id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4'),  -- LEGACY, see above
           p_name, p_pin) l;
$$;

COMMENT ON FUNCTION public.get_staff_portal_logins() IS
  'DEPRECATED. Kept only so service-worker-cached copies of the old portal keep working. Use the (text) overload.';
COMMENT ON FUNCTION public.get_staff_portal_roster() IS
  'DEPRECATED. Kept only so service-worker-cached copies of the old portal keep working. Use the (text) overload.';
COMMENT ON FUNCTION public.staff_portal_login(text, text) IS
  'DEPRECATED. Kept only so service-worker-cached copies of the old portal keep working. Use the (text, text, text) overload.';

-- End 903_staff_portal_multi_tenant.
