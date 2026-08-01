-- 893_org_document_branding.sql
-- Runs on BOTH databases.
--
-- 870 moved the company NAME, address, registration, tax number and
-- banking onto org_settings, because the fallbacks were S&N's real values
-- and a second agency would have invoiced its customers into S&N's bank
-- account. That fixed where the money goes. It did not fix what the
-- document says.
--
-- Everything around the numbers is still S&N's, hardcoded into the two
-- document renderers — invRender() for guest quotes and invoices, and
-- renderOwnerStatementPreview() for owner statements:
--
--   * the letterhead reads "S&N APARTMENTS®"
--   * under it, the trading line "Beyond the booking" and the strapline
--     "CURATED STAYS · PERSONAL SERVICE"
--   * two signature blocks, "Nicole Babczyk" and "Silja Faltin", both
--     captioned DIRECTOR · S&N APT MANAGEMENT
--   * a footer carrying S&N's name and SN_Apt_Management@outlook.com
--
-- So a second agency's invoice to their own paying customer arrives with
-- another company's name at the top, two strangers' signatures at the
-- bottom, and a stranger's email address to reply to. The bank details
-- would be right, which somehow makes it worse: the document looks
-- deliberate.
--
-- Three columns, and the app omits each one when it is blank rather than
-- substituting anything. An invoice with no tagline looks plain. An
-- invoice with someone else's tagline looks like fraud.

ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS tagline   text;
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS strapline text;

-- [{"name": "...", "title": "..."}] — an array because S&N signs with two
-- directors, and a sole trader signs with none. Empty is a valid answer:
-- no signature block is printed, which is what most invoices look like.
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS signatories jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.org_settings.tagline IS
  'Trading line printed under the business name on documents, e.g. "Beyond the booking". Blank prints nothing.';
COMMENT ON COLUMN public.org_settings.strapline IS
  'Small caps line under the tagline, e.g. "CURATED STAYS - PERSONAL SERVICE". Blank prints nothing.';
COMMENT ON COLUMN public.org_settings.signatories IS
  'Who signs off documents: [{"name","title"}]. Empty array prints no signature block, which is the correct default for a new org.';

-- Backfill S&N with exactly what the code was printing, so their invoices
-- come out byte-identical and nobody has to re-enter anything. Every
-- other org keeps the blank defaults.
UPDATE public.org_settings
   SET tagline     = COALESCE(NULLIF(tagline,   ''), 'Beyond the booking'),
       strapline   = COALESCE(NULLIF(strapline, ''), 'CURATED STAYS · PERSONAL SERVICE'),
       signatories = CASE WHEN signatories = '[]'::jsonb THEN
                       '[{"name":"Nicole Babczyk","title":"DIRECTOR"},
                         {"name":"Silja Faltin","title":"DIRECTOR"}]'::jsonb
                     ELSE signatories END
 WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4';

-- End 893_org_document_branding.
