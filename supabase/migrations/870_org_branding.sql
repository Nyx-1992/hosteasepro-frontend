-- 870_org_branding.sql
-- Runs on BOTH databases.
--
-- Makes the app's identity belong to the ORG rather than to S&N.
--
-- ── WHAT WAS WRONG ────────────────────────────────────────────────
--
-- HEP is being sold to other agencies, and the app still hardcodes S&N
-- everywhere: the sidebar subtitle, the WhatsApp number guests are
-- messaged from, the sign-off on those messages, and — the one that is
-- not cosmetic — INV_COMPANY, whose fallback carries S&N's registration
-- number, tax number and NEDBANK ACCOUNT.
--
-- org_settings already existed and invoices already read it, but every
-- field falls back to S&N's value when the row is missing or blank, and
-- only S&N has a row. So a new agency would issue invoices asking their
-- customers to pay S&N's bank account. That is a money-routing bug
-- wearing a branding bug's clothes, and it is the reason this is a
-- blocker rather than a nicety.
--
-- The same shape of mistake as the hardcoded PROPS fallback (p3-18): a
-- default that is one tenant's real data is never a safe default.
--
-- ── WHAT THIS ADDS ────────────────────────────────────────────────
-- The identity fields the UI needs but org_settings had no home for.
-- Banking, address, registration and tax already exist here.
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS short_name text;
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS logo text;
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS country text;

COMMENT ON COLUMN public.org_settings.short_name IS
  'Abbreviation used where the full business name will not fit.';
COMMENT ON COLUMN public.org_settings.logo IS
  'Emoji shown as the app mark. Emoji rather than an uploaded image so a new org has an identity in one keystroke, with no storage bucket, no sizing rules and nothing to moderate.';
COMMENT ON COLUMN public.org_settings.whatsapp IS
  'The number guests are messaged from, digits only with country code. Guest messages are SENT from here — an unset value must fall back to nothing, never to another org''s number.';

-- Backfill S&N from the values that were hardcoded, so nothing changes
-- for the org that is live today.
UPDATE public.org_settings
   SET short_name = COALESCE(short_name, 'S&N'),
       logo       = COALESCE(logo, '🏠'),
       whatsapp   = COALESCE(whatsapp, '27636021847'),
       website    = COALESCE(website, 'https://www.snapartments.co.za'),
       country    = COALESCE(country, 'ZA')
 WHERE business_name ILIKE 'S&N%';

-- Every org gets a row, so "no row" stops meaning "inherit S&N".
-- Deliberately blank rather than pre-filled: a blank bank account on an
-- invoice is obviously wrong to whoever reads it, and gets fixed. The
-- wrong bank account is silently wrong, and does not.
-- address is NOT NULL on this table, so it is seeded empty rather than
-- omitted; blank is the honest state for an org that has not filled it in.
INSERT INTO public.org_settings (org_id, id, business_name, address, currency, country)
SELECT o.id, o.id, o.name, '', 'ZAR', 'ZA'
FROM public.organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.org_settings s WHERE s.org_id = o.id)
ON CONFLICT (id) DO NOTHING;

-- End 870_org_branding.
