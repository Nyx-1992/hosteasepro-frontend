-- 095_staging_ical_feeds_index_fix.sql
-- STAGING ONLY — do NOT run against production (production already has this index).
--
-- Schema drift found while running 090_staging_ical_feeds_seed.sql: staging's
-- public.ical_feeds table is missing the unique index that
-- 050_ical_feeds.sql defines (ical_feeds_unique_platform_property), so the
-- ON CONFLICT (org_id, property_id, platform) clause in 090 fails with
-- "42P10: there is no unique or exclusion constraint matching the ON
-- CONFLICT specification". Production has the index; staging never got it.
--
-- Run this, then re-run 090_staging_ical_feeds_seed.sql.

CREATE UNIQUE INDEX IF NOT EXISTS ical_feeds_unique_platform_property
  ON public.ical_feeds (org_id, property_id, platform);

-- End 095_staging_ical_feeds_index_fix.
