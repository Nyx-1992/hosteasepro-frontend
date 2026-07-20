-- 230_roadmap_state_p1_1.sql
-- Runs on BOTH databases. Marks Roadmap item p1-1 (remove hardcoded
-- property/org UUIDs from JS) done. Same pattern as 120/140/180/200/210/220.
-- No schema change required — ical_feeds and properties.cleaning_fee
-- already existed and were already correctly populated (confirmed live on
-- both databases before this change shipped).

DELETE FROM public.roadmap_state WHERE task_key = 'p1-1';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p1-1', true, now());

-- End 230_roadmap_state_p1_1.
