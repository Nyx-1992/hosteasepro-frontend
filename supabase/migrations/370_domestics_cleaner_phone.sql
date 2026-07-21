-- 370_domestics_cleaner_phone.sql
-- Runs on BOTH databases.
--
-- Adds domestics.cleaner_phone — captured when assigning an outside
-- ("Other") cleaner not in our regular CLEANERS list, so we (a) have a
-- number for payment and (b) can WhatsApp them the standard cleaning
-- checklist directly from the Schedule Cleaning modal. Null for our four
-- regular cleaners (their numbers already live in the Team/contacts list).

ALTER TABLE public.domestics ADD COLUMN IF NOT EXISTS cleaner_phone text;

-- End 370_domestics_cleaner_phone.
