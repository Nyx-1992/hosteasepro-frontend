-- 010_seed_ical_feeds.sql
-- Seed iCal feed URLs (KEEP REPO PRIVATE). Requires properties existing for given names.
-- Idempotent via ON CONFLICT.

-- NOTE: a WITH clause only scopes to the single statement it prefixes, so
-- each INSERT below repeats its own complete WITH — they cannot share one
-- across the semicolon. (Previously broken both this way and by an
-- ambiguous `id` column reference — both fixed here.)

WITH org AS (
	SELECT id FROM public.organizations ORDER BY created_at LIMIT 1
), speranta AS (
	SELECT p.id FROM public.properties p JOIN org ON p.org_id = org.id WHERE p.name = 'Speranta Flat' LIMIT 1
)
INSERT INTO public.ical_feeds (org_id, property_id, platform, feed_url)
SELECT org.id, speranta.id, v.platform, v.url FROM org, speranta,
( VALUES
	('booking','https://ical.booking.com/v1/export?t=REDACTED-ROTATE-ME'),
	('lekkeslaap','https://www.lekkeslaap.co.za/suppliers/icalendar.ics?t=REDACTED-ROTATE-ME'),
	('fewo','http://www.fewo-direkt.de/icalendar/REDACTED-ROTATE-ME.ics?nonTentative'),
	('airbnb','https://www.airbnb.com/calendar/ical/REDACTED-ROTATE-ME.ics?s=REDACTED&locale=en-GB')
) AS v(platform,url)
ON CONFLICT (org_id, property_id, platform) DO NOTHING;

WITH org AS (
	SELECT id FROM public.organizations ORDER BY created_at LIMIT 1
), tvhouse AS (
	SELECT p.id FROM public.properties p JOIN org ON p.org_id = org.id WHERE p.name = 'TV House' LIMIT 1
)
INSERT INTO public.ical_feeds (org_id, property_id, platform, feed_url)
SELECT org.id, tvhouse.id, v.platform, v.url FROM org, tvhouse,
( VALUES
	('booking','https://ical.booking.com/v1/export?t=REDACTED-ROTATE-ME'),
	('lekkeslaap','https://www.lekkeslaap.co.za/suppliers/icalendar.ics?t=REDACTED-ROTATE-ME'),
	('airbnb','https://www.airbnb.com/calendar/ical/REDACTED-ROTATE-ME.ics?s=REDACTED&locale=en-GB')
) AS v(platform,url)
ON CONFLICT (org_id, property_id, platform) DO NOTHING;

-- Verification (optional): SELECT platform, feed_url FROM public.ical_feeds;
