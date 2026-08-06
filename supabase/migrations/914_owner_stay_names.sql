-- 914_owner_stay_names.sql
-- Runs on BOTH databases.
--
-- Needed by the server-side booking import (api/_lib/icalImport.js), and a
-- multi-tenancy bug in its own right.
--
-- ══ WHOSE NAMES ARE IN THE CODE ═══════════════════════════════════
--
-- syncICalFeeds() in demo/index_fixed.html decides an iCal event is an
-- OWNER STAY — excluded from revenue, shown differently, never treated as
-- a guest — like this:
--
--   sumLower.includes('mirka') || sumLower.includes('antonin') ||
--   sumLower.includes('nicole') || sumLower.includes('silja') ||
--   sumLower.includes('owner')
--
-- Four first names. They are S&N's two owner couples, written into logic
-- that every agency's calendar is run through. Another agency takes a
-- booking from a guest called Nicole and HEP silently reclassifies it as
-- the owner using the flat: it leaves their occupancy, it leaves their
-- income, and nothing anywhere says why.
--
-- A DEFAULT THAT IS ONE TENANT'S REAL DATA IS NEVER A SAFE DEFAULT.
--
-- ══ WHY THE FIX IS A COLUMN AND NOT A DELETION ════════════════════
--
-- Deleting the names is not enough on its own: S&N's calendars really do
-- say "Mirka", and their owner stays would start counting as revenue —
-- swapping one silent misclassification for another, in their own books.
--
-- So the names move to where they belong: onto S&N's row. Every other
-- org gets an empty list and the generic 'owner' test, so nobody inherits
-- anybody's family. Seeded below for the org that already relies on them,
-- and for no one else.

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS owner_stay_names text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.org_settings.owner_stay_names IS
  'Names that mean "the owner is staying" when they appear in a calendar event, so the stay is not counted as revenue. Empty for every org that has not set one — these were four hardcoded first names in shared client code, which reclassified any other agency''s guest of the same name as an owner stay.';

-- Seed ONLY the org that is already depending on this behaviour, matched
-- by name rather than by a uuid pasted into a migration that has to run on
-- two databases. Anywhere it does not match, nothing happens.
UPDATE public.org_settings s
   SET owner_stay_names = ARRAY['mirka','antonin','nicole','silja']
  FROM public.organizations o
 WHERE o.id = s.org_id
   AND o.portal_key = 'sn-apt-management'
   AND s.owner_stay_names = '{}';

-- Exposed to the importer, which runs as the service role and so needs no
-- grant, and to the app so the Business Info screen can eventually edit
-- it. RLS on org_settings already scopes reads to the caller's own org.

-- End 914_owner_stay_names.
