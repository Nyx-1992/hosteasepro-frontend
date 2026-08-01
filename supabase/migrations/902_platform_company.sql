-- 902_platform_company.sql
-- Runs on BOTH databases.
--
-- HOSTEASE PRO was registered with CIPC on 2026-08-01, enterprise number
-- 2026/613044/07. That makes the platform a legal person distinct from
-- S&N Apt Management for the first time, and the distinction has to exist
-- in the data before the first customer is invoiced.
--
-- ══ WHY NOT org_settings ══════════════════════════════════════════
--
-- Every OTHER company in this system is a tenant: an agency that signed
-- up, with its own org row, its own properties, its own customers. HEP is
-- not one of those. It is the thing they are all tenants OF, and it bills
-- them. Its legal identity therefore belongs at the platform level, next
-- to billing_live and the PayFast configuration, not in a row that the
-- multi-tenant machinery treats as just another agency.
--
-- Putting it in an org would also mean choosing an org, and the only
-- honest answer today is "none of them" — see the note on platform_org_id
-- below.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS company_name  text,
  ADD COLUMN IF NOT EXISTS reg_number    text,
  ADD COLUMN IF NOT EXISTS vat_number    text,
  ADD COLUMN IF NOT EXISTS company_email text,
  ADD COLUMN IF NOT EXISTS bank_name     text,
  ADD COLUMN IF NOT EXISTS bank_account  text,
  ADD COLUMN IF NOT EXISTS bank_branch   text;

COMMENT ON COLUMN public.platform_settings.company_name IS
  'Registered name of the company that bills HEP''s customers. NOT any tenant''s name — this is the platform''s own legal identity and appears on the invoices agencies receive.';
COMMENT ON COLUMN public.platform_settings.reg_number IS
  'CIPC enterprise number. Required on South African tax invoices.';
COMMENT ON COLUMN public.platform_settings.vat_number IS
  'Null until HEP registers for VAT. Compulsory above R1m turnover; voluntary from R50k. Absent rather than blank so an invoice template can tell "not registered" from "nobody filled it in".';
COMMENT ON COLUMN public.platform_settings.bank_account IS
  'The platform''s own account, pending. Deliberately separate from any tenant''s banking: HEP''s subscription revenue and an agency''s rental income are different companies'' money and must never share a field.';

-- The row is a singleton (id boolean PRIMARY KEY DEFAULT true), so this
-- updates the one that exists rather than risking a second.
UPDATE public.platform_settings
   SET company_name = 'HOSTEASE PRO',
       reg_number   = '2026/613044/07'
 WHERE company_name IS NULL;

-- ══ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO ══════════════════
--
-- platform_org_id still points at S&N Apt Management. That is now
-- factually wrong — HEP is its own company — but correcting it here would
-- break the owner's access on the next page load, and quietly.
--
-- isPlatformOwner() is currentUser.org_id === platform_org_id. The owner's
-- profile lives in S&N's org, because that is where she manages the
-- properties. Repoint platform_org_id at a new HEP org and she stops being
-- the platform owner: the Roadmap tab disappears, the billing controls
-- disappear, and 891's row-level policies stop returning her own roadmap
-- notes. Nothing errors. The tab is simply not there.
--
-- The real fix is not a one-line UPDATE. One person needs to be the owner
-- of two organisations — S&N for the properties, HEP for the platform —
-- and the app has no way to be in two orgs at once. That needs either a
-- second login or an org switcher, and it is a decision about how she
-- works every day, not a migration.
--
-- It is also not urgent: billing_live is false and HEP has no paying
-- customers. It becomes urgent the moment one exists, because from then on
-- HEP's subscription revenue would be invoiced under a property-management
-- company's name and registration number.
--
-- BLOCKS: switching billing_live on.

-- End 902_platform_company.
