-- 300_roadmap_state_p0_32.sql
-- Runs on BOTH databases. Marks Roadmap item p0-32 (Owner statements /
-- B2) done. No schema change was needed for B2 itself — everything is
-- computed live from bookings/domestics, nothing new to store.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-32';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-32', true, now());

-- End 300_roadmap_state_p0_32.
