-- 430_domestics_link_sent_at.sql
-- Runs on BOTH databases.
--
-- Adds domestics.link_sent_at so the "Other" cleaner box can show "Last
-- sent <date>" and offer a Resend, instead of giving no indication at all
-- of whether the inventory link + cleaning guideline were ever sent to a
-- given outside cleaner. Set by sendOutsideCleanerWhatsApp() in
-- demo/index_fixed.html every time the Send/Resend button actually opens
-- WhatsApp with the message.

ALTER TABLE public.domestics ADD COLUMN IF NOT EXISTS link_sent_at timestamptz;

-- End 430_domestics_link_sent_at.
