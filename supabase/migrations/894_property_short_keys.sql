-- 894_property_short_keys.sql
-- Runs on BOTH databases.
--
-- The app identifies a property two different ways and always has:
--
--   bookings.property_id   uuid
--   tasks.property_id      uuid
--   domestics.property_id  text — 'speranta', 'tvhouse'
--
-- So the short key is not cosmetic. It is a live foreign key in 57
-- cleaning records, and anything that changes it orphans them.
--
-- properties.short_key already exists and is already correct for S&N. But
-- the app never read it. It derived the key in JavaScript instead:
--
--   const key = n.includes('speranta') ? 'speranta'
--             : n.includes('tv')       ? 'tvhouse'
--             : (p.code || p.id).toLowerCase();
--
-- Two agency-specific string matches, then a fallback to a code column
-- that is usually empty, then to a raw uuid. For anyone but S&N that
-- produced uuid-shaped keys — which work, until you notice that a
-- property named "TV Lounge" or "Riverside Cottage" collides straight
-- into S&N's 'tvhouse' branch and inherits a stranger's cleaning history.
-- The one-in-a-hundred case is the dangerous one: it does not error, it
-- silently files the clean against the wrong property.
--
-- This migration makes short_key the single source of that key.

-- ══ 1. EVERY PROPERTY GETS ONE ════════════════════════════════════
-- Slug of the name, trimmed to something readable, uniquified within the
-- org. Not globally: two agencies may both have a "beach-house", and
-- there is no reason they should not.
CREATE OR REPLACE FUNCTION public.property_slug(p_name text, p_org uuid, p_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  base text;
  try  text;
  n    int := 1;
BEGIN
  base := lower(coalesce(p_name, ''));
  base := regexp_replace(base, '[^a-z0-9]+', '', 'g');
  base := left(base, 24);
  IF base = '' THEN base := 'property'; END IF;

  try := base;
  WHILE EXISTS (SELECT 1 FROM public.properties
                 WHERE org_id = p_org AND short_key = try
                   AND (p_id IS NULL OR id <> p_id)) LOOP
    n := n + 1;
    try := base || n::text;
  END LOOP;
  RETURN try;
END $$;

-- Backfill. S&N already has 'speranta' and 'tvhouse' and is untouched by
-- the WHERE clause — those keys must not move, 57 cleaning records point
-- at them.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, org_id, name FROM public.properties
            WHERE short_key IS NULL OR btrim(short_key) = ''
            ORDER BY created_at NULLS LAST, id
  LOOP
    UPDATE public.properties
       SET short_key = public.property_slug(r.name, r.org_id, r.id)
     WHERE id = r.id;
  END LOOP;
END $$;

-- ══ 2. AND KEEPS IT ═══════════════════════════════════════════════
-- New properties get a key on insert without the app having to think
-- about it. Deliberately only fires when short_key is NULL: renaming a
-- property must NOT re-slug it, because the old key is what the cleaning
-- records carry. The key is an identity, not a label.
CREATE OR REPLACE FUNCTION public.set_property_short_key()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.short_key IS NULL OR btrim(NEW.short_key) = '' THEN
    NEW.short_key := public.property_slug(NEW.name, NEW.org_id, NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_property_short_key ON public.properties;
CREATE TRIGGER trg_property_short_key
  BEFORE INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_property_short_key();

-- ══ 3. UNIQUE WITHIN THE ORG ══════════════════════════════════════
-- The constraint the whole scheme rests on. Without it two properties in
-- one org can share a key, and a clean logged against that key belongs to
-- both — which is worse than belonging to neither, because it looks fine.
CREATE UNIQUE INDEX IF NOT EXISTS properties_org_short_key_uniq
  ON public.properties (org_id, short_key);

COMMENT ON COLUMN public.properties.short_key IS
  'Stable per-org identifier, e.g. ''speranta''. domestics.property_id stores THIS, not the uuid, so it must never change once rows reference it — renaming a property deliberately does not re-slug it.';

-- End 894_property_short_keys.
