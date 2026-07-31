-- 810_rebrand_sunset_coast_stays.sql
-- Runs on BOTH databases.
--
-- The booking site's name is now SUNSET COAST STAYS (owner's choice,
-- 2026-07-31, from a shortlist checked for DNS availability and against
-- existing Cape Town accommodation brands).
--
-- Why this name won: the guest base is substantially foreign (German,
-- Polish, Czech), and for a DIRECT-booking business the domain has to
-- survive being said over WhatsApp and typed correctly first time.
-- "Blouberg" — the stronger search term — fails that repeatedly;
-- "Sunset Coast" does not. It also covers Milnerton through Big Bay
-- without privileging one suburb, and Sunset Beach is a real suburb in
-- the middle of the patch, so it is literal rather than decorative.
-- Rejected: "Table Bay Stays" (the landmark Table Bay Hotel at the V&A,
-- relaunched as InterContinental after a R1bn refit — trademark
-- exposure in the same class plus an unwinnable SEO fight).
--
-- This migration updates the SEEDED WEBSITE COPY only (800). The
-- corresponding code rename lives in the booking site's own repo
-- (nyx-1992/snapartments-frontend), and HEP's own references now flow
-- through a single BOOKING_SITE_URL constant so the domain switch is one
-- edit rather than five.
--
-- SUPERSEDES roadmap p0-8 ("Rebrand booking site Nestora -> S&N
-- Apartments"), which is now the wrong move: the booking site is not
-- S&N. S&N Apartments is the property-MANAGEMENT company and keeps
-- snapartments.co.za.
--
-- Uses || so only the named keys change and the rest of each page's
-- content is left untouched.

UPDATE public.site_content
SET content = content || jsonb_build_object('intro_eyebrow', 'Why book with Sunset Coast Stays')
WHERE site_key = 'bookings' AND page = 'home'
  AND content->>'intro_eyebrow' = 'Why book with Nestora';

UPDATE public.site_content
SET content = content || jsonb_build_object(
      'title', 'Sunset Coast Stays — Direct Beach Stays in Cape Town',
      -- Milnerton added: the old description named only Blouberg and
      -- Tableview, while the portfolio and the new name both cover the
      -- wider stretch.
      'description', 'Book direct and save. Beautiful apartments and houses in Blouberg, Tableview and Milnerton, Cape Town. No platform fees, best rate guaranteed.')
WHERE site_key = 'bookings' AND page = 'seo';

-- Verification: expect 0 rows.
--   SELECT page FROM public.site_content
--   WHERE site_key='bookings' AND content::text ILIKE '%nestora%';

-- End 810_rebrand_sunset_coast_stays.
