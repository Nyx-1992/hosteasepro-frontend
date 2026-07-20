-- 200_roadmap_state_p0_24.sql
-- Runs on BOTH databases. Marks Roadmap item p0-24 (Convert to booking /
-- confirmed owner block UI) done. Same pattern as 120/140/180.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-24';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-24', true, now());

-- End 200_roadmap_state_p0_24.
