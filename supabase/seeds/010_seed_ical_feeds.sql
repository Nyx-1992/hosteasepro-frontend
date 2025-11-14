-- 010_seed_ical_feeds.sql
-- Seed iCal feed URLs (KEEP REPO PRIVATE). Requires properties existing for given names.
-- Idempotent via ON CONFLICT.

WITH org AS (
	SELECT id FROM public.organizations ORDER BY created_at LIMIT 1
), speranta AS (
	SELECT id FROM public.properties p JOIN org ON p.org_id = org.id WHERE p.name = 'Speranta Flat' LIMIT 1
), tvhouse AS (
	SELECT id FROM public.properties p JOIN org ON p.org_id = org.id WHERE p.name = 'TV House' LIMIT 1
)
INSERT INTO public.ical_feeds (org_id, property_id, platform, feed_url)
SELECT org.id, speranta.id, v.platform, v.url FROM org, speranta,
( VALUES
	('booking','https://ical.booking.com/v1/export?t=8123e217-45b4-403d-8fa0-9dcc65c26800'),
	('lekkeslaap','https://www.lekkeslaap.co.za/suppliers/icalendar.ics?t=bXEzOHNicTJQT3Nkd1dHb1ZSaXhRUT09'),
	('fewo','http://www.fewo-direkt.de/icalendar/12b719114ecd42adab4e9ade2d2458e6.ics?nonTentative'),
	('airbnb','https://www.airbnb.com/calendar/ical/1237076374831130516.ics?s=01582d0497e99114aa6013156146cea4&locale=en-GB')
) AS v(platform,url)
ON CONFLICT (org_id, property_id, platform) DO NOTHING;

INSERT INTO public.ical_feeds (org_id, property_id, platform, feed_url)
SELECT org.id, tvhouse.id, v.platform, v.url FROM org, tvhouse,
( VALUES
	('booking','https://ical.booking.com/v1/export?t=ea29c451-4d0b-4fa4-b7a8-e879a33a8940'),
	('lekkeslaap','https://www.lekkeslaap.co.za/suppliers/icalendar.ics?t=QzZ2aFlFVHhxYnoxdGRVL3ZwelRGUT09'),
	('airbnb','https://www.airbnb.com/calendar/ical/1402174824640448492.ics?s=373c5a71c137230a72f928e88728dcf3&locale=en-GB')
) AS v(platform,url)
ON CONFLICT (org_id, property_id, platform) DO NOTHING;

-- Verification (optional): SELECT platform, feed_url FROM public.ical_feeds;
