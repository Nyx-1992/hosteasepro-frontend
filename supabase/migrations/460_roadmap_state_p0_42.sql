-- 460_roadmap_state_p0_42.sql
-- Runs on BOTH databases. Marks Roadmap item p0-42 (outside-cleaner
-- inventory submit failed: RPC assumed domestics.org_id exists) done.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-42';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-42', true, now());

-- End 460_roadmap_state_p0_42.
