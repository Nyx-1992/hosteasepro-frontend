-- 470_roadmap_state_p0_43.sql
-- Runs on BOTH databases. Marks Roadmap item p0-43 (convert all remaining
-- window.confirm() calls to the non-blocking confirmAction() modal) done.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-43';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-43', true, now());

-- End 470_roadmap_state_p0_43.
