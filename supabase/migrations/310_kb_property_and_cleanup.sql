-- 310_kb_property_and_cleanup.sql
-- Runs on BOTH databases.
--
-- 1. kb_articles gets a property_id column so General Notes tiles can be
--    tagged to one property (or left 'all' for both) and filtered by the
--    same property switcher already used across Dashboard/Tasks/Calendar.
-- 2. Removes Finance-category notes from kb_articles — per owner feedback,
--    management fees / salaries / cleaner pay don't belong on this
--    operational reference page (Reports and Team already cover that).

ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS property_id text NOT NULL DEFAULT 'all';

DELETE FROM public.kb_articles WHERE category = 'Finance';

-- End 310_kb_property_and_cleanup.
