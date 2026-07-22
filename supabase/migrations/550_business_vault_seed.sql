-- 550_business_vault_seed.sql
-- Runs on BOTH databases.
--
-- Seeds business_vault (540_business_vault.sql) with the company
-- registration/tax/bank details that were previously hardcoded, in plain
-- view, in the Settings tab — visible to anyone with owner/admin access
-- scrolling past, not admin-eyes-only the way the rest of Business Info
-- now is. Transcribed as-is from that block, nothing invented.
--
-- Guarded with WHERE NOT EXISTS (matched by org + title), same pattern as
-- 530_team_contacts_recovered.sql, since this table's only unique
-- constraint is its uuid primary key — safe to run more than once.

INSERT INTO public.business_vault (org_id, cat, title, content)
SELECT '5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'legal', 'Company Registration', 'Business Name: SN Apt Management
Registration: 2024/643198/07'
WHERE NOT EXISTS (SELECT 1 FROM public.business_vault WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND title = 'Company Registration');

INSERT INTO public.business_vault (org_id, cat, title, content)
SELECT '5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'tax', 'Tax Number', '9008226327'
WHERE NOT EXISTS (SELECT 1 FROM public.business_vault WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND title = 'Tax Number');

INSERT INTO public.business_vault (org_id, cat, title, content)
SELECT '5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'banking', 'Bank Details', 'Nedbank · 198765'
WHERE NOT EXISTS (SELECT 1 FROM public.business_vault WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND title = 'Bank Details');

-- End 550_business_vault_seed.
