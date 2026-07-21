-- 330_org_settings_account_name_fix.sql
-- Runs on BOTH databases.
--
-- org_settings.account_name (used as the banking "Account name" on both
-- the guest invoice and Management Invoice PDFs) was stored as "SN Apt
-- Management" — missing the ampersand that appears everywhere else on
-- the same document ("S&N Apt Management" in ISSUED BY, notes, footer,
-- signatures). Corrects it if present; no-op otherwise.

UPDATE public.org_settings
SET account_name = 'S&N Apt Management'
WHERE account_name = 'SN Apt Management';

-- End 330_org_settings_account_name_fix.
