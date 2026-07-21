-- 420_roadmap_state_p0_40.sql
-- Runs on BOTH databases. Marks Roadmap item p0-40 (outside cleaner: real
-- photo cleaning guide + one-click send + self-test link) done.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-40';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-40', true, now());

-- End 420_roadmap_state_p0_40.
