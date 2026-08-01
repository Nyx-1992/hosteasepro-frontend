-- 897_property_ical_tokens.sql
-- Runs on BOTH databases.
--
-- HEP publishes an outbound iCal feed per property, so a booking taken
-- here blocks the dates on Airbnb, Booking.com and LekkeSlaap. It has
-- only ever existed for S&N: two hardcoded serverless functions,
-- api/speranta-cal.js and api/tvhouse-cal.js, wired to two fixed routes.
-- Every other agency has the panel hidden and no feed at all — which for
-- a multi-property host is not a missing nicety, it is the difference
-- between one calendar and three that drift into double bookings.
--
-- ══ WHY A TOKEN AND NOT THE SHORT KEY ═════════════════════════════
--
-- The obvious generalisation is /api/calendar/{short_key}.ics. It would
-- work, and it would also mean every agency's occupancy is enumerable by
-- guessing property names.
--
-- The content is not especially sensitive — the feed deliberately emits
-- "Not Available" and never a guest name, which is the whole point of
-- publishing it to competitors' platforms. But "not especially
-- sensitive" and "should be enumerable by anyone" are different claims,
-- and a token costs nothing.
--
-- The other reason is revocation. A feed URL, once pasted into three
-- platforms, is effectively public forever. With a token it can be
-- rotated without renaming the property; with a slug the only way to
-- invalidate it is to change the key, which is exactly what 894
-- established must never move because domestics.property_id stores it.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS ical_token text;

CREATE OR REPLACE FUNCTION public.new_ical_token()
RETURNS text LANGUAGE sql VOLATILE AS $$
  -- 32 hex characters from gen_random_bytes. Not a uuid, because a uuid
  -- in a URL invites someone to try it as a record id somewhere else.
  SELECT encode(gen_random_bytes(16), 'hex');
$$;

UPDATE public.properties
   SET ical_token = public.new_ical_token()
 WHERE ical_token IS NULL OR btrim(ical_token) = '';

CREATE OR REPLACE FUNCTION public.set_property_ical_token()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.ical_token IS NULL OR btrim(NEW.ical_token) = '' THEN
    NEW.ical_token := public.new_ical_token();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_property_ical_token ON public.properties;
CREATE TRIGGER trg_property_ical_token
  BEFORE INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_property_ical_token();

-- A collision would serve one agency's calendar under another's URL.
CREATE UNIQUE INDEX IF NOT EXISTS properties_ical_token_uniq
  ON public.properties (ical_token);

COMMENT ON COLUMN public.properties.ical_token IS
  'Unguessable id for this property''s outbound iCal feed, /api/calendar/{token}.ics. Rotating it invalidates the URL wherever it has been pasted — which is the point, since a feed URL given to three booking platforms cannot otherwise be taken back.';

-- End 897_property_ical_tokens.
