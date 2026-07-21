-- 500_roadmap_state_p0_46.sql
-- Runs on BOTH databases. Marks Roadmap item p0-46 (confirm-delete popup
-- rendered behind an already-open modal) done.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-46';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-46', true, now());

-- End 500_roadmap_state_p0_46.
