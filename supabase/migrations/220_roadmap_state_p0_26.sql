-- 220_roadmap_state_p0_26.sql
-- Runs on BOTH databases. Marks Roadmap item p0-26 (--warm CSS variable
-- fix) done. Same pattern as 120/140/180/200/210.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-26';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-26', true, now());

-- End 220_roadmap_state_p0_26.
