-- 860_managed_revenue_platforms.sql
-- Runs on BOTH databases.
--
-- Which platforms' MONEY does the agency actually handle for a property?
--
-- This is not the same question as which platforms a property is listed
-- on, and conflating the two produced a wrong conclusion about TV House.
--
-- ── THE ARRANGEMENT THIS RECORDS ──────────────────────────────────
--
-- The owner's words: "We don't do that with the TV house and hence we
-- don't care if their numbers come in. They set up Booking.com
-- themselves (most of their revenue), whereas we set up Airbnb and
-- LekkeSlaap. So that money only comes through us and we report back to
-- them."
--
-- So for TV House the agency manages the STAYS on every channel —
-- cleaning, guests, turnovers, the calendar — but the MONEY only on
-- Airbnb and LekkeSlaap. Booking.com pays the owner directly and S&N
-- never sees a statement for it.
--
-- Without this recorded, TV House looks like a property with 16
-- Booking.com bookings and no revenue, which reads as broken data. It is
-- not broken; it is out of scope. Reports was about to grow a warning
-- for exactly this, which would have nagged forever about something
-- nobody wants.
--
-- ── WHY IT MATTERS MORE THAN IT LOOKS ─────────────────────────────
--
-- 1. It stops the agency chasing statements it is never going to get.
-- 2. It tells the CLIENT dashboard what its income figure means. Without
--    it, the TV House owner logs in, sees a total covering Airbnb and
--    LekkeSlaap only, and reasonably concludes their manager has lost
--    most of their money.
-- 3. Every agency HEP is sold to will have this split — some properties
--    where they run all the channels, some where the owner keeps one.
--
-- NULL means "all platforms", so every existing property keeps behaving
-- exactly as it does today and a new one needs no thought until the
-- arrangement is actually different.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS revenue_platforms text[];

COMMENT ON COLUMN public.properties.revenue_platforms IS
  'Platforms whose payouts flow through the agency, so statements are expected and income is reported. NULL = all of them. Anything omitted is paid direct to the owner and is deliberately absent from the agency''s income figures — not missing data.';

-- TV House: the owner runs Booking.com themselves and is paid directly.
-- 'direct' stays with the agency — a booking taken directly is money that
-- comes through S&N, so it belongs on the reported side.
UPDATE public.properties
   SET revenue_platforms = ARRAY['airbnb','lekkeslaap','direct']
 WHERE short_key = 'tvhouse' AND revenue_platforms IS NULL;

-- Speranta is S&N's own property — every channel, every rand. Left NULL
-- rather than spelled out, so adding a channel there needs no migration.

-- End 860_managed_revenue_platforms.
