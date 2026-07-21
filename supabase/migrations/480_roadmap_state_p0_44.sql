-- 480_roadmap_state_p0_44.sql
-- Runs on BOTH databases. Marks Roadmap item p0-44 (outside cleaner: the
-- staff portal's own separate "Assign Cleaning" flow never got the
-- phone/send feature) done.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-44';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-44', true, now());

-- End 480_roadmap_state_p0_44.
