-- 410_roadmap_state_p0_39.sql
-- Runs on BOTH databases. Marks Roadmap item p0-39 (p0-38 fixes: SQL join
-- type mismatch, unquoted domestic ID breaking Edit/Delete, phone made
-- optional) done.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-39';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-39', true, now());

-- End 410_roadmap_state_p0_39.
