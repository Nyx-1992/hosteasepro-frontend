-- 290_roadmap_state_p0_31.sql
-- Runs on BOTH databases. Marks Roadmap item p0-31 (Property Manual /
-- Knowledge tab rebuild, B3) done.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-31';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-31', true, now());

-- End 290_roadmap_state_p0_31.
