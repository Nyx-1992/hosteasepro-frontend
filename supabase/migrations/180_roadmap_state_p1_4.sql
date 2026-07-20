-- 180_roadmap_state_p1_4.sql
-- Runs on BOTH databases. Marks Roadmap item p1-4 (per-org commission
-- rates) done — satisfied by Task 5's platform_fee_config table, a
-- different mechanism than the item's original "org_settings" phrasing but
-- the same underlying ask. Same pattern as 120/140.

DELETE FROM public.roadmap_state WHERE task_key = 'p1-4';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p1-4', true, now());

-- End 180_roadmap_state_p1_4.
