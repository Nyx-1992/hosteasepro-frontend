-- 210_roadmap_state_p0_21.sql
-- Runs on BOTH databases. Marks Roadmap item p0-21 (overdue-clean grace
-- window full design) done. Same pattern as 120/140/180/200.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-21';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-21', true, now());

-- End 210_roadmap_state_p0_21.
