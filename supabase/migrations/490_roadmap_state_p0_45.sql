-- 490_roadmap_state_p0_45.sql
-- Runs on BOTH databases. Marks Roadmap item p0-45 (inventory report
-- "Create task" button vanished for good once reviewed, with no way to
-- redo a deleted task) done.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-45';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-45', true, now());

-- End 490_roadmap_state_p0_45.
