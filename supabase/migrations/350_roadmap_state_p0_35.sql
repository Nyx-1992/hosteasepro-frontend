-- 350_roadmap_state_p0_35.sql
-- Runs on BOTH databases. Marks Roadmap item p0-35 (real root cause of
-- the recurring "INP Issue" popup on booking delete — window.confirm()
-- blocking the main thread, not slow rendering) done.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-35';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-35', true, now());

-- End 350_roadmap_state_p0_35.
