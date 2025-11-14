INSERT INTO public.ical_feeds (org_id, property_id, platform, url)
SELECT o.id, p.id, v.platform, v.url
FROM public.organizations o
JOIN public.properties p ON p.org_id = o.id
JOIN (
  VALUES
    ('speranta','booking','https://...booking-speranta.ics'),
    ('speranta','airbnb','https://...airbnb-speranta.ics'),
    ('tv-house','booking','https://...booking-tvhouse.ics'),
    ('tv-house','airbnb','https://...airbnb-tvhouse.ics')
) AS v(property_code, platform, url)
WHERE p.code = v.property_code
ON CONFLICT DO NOTHING;
