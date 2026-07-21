-- 360_roadmap_state_p0_36.sql
-- Runs on BOTH databases. Marks Roadmap item p0-36 (Guest Timeline: drop
-- redundant Check-in day message, make every stage always
-- previewable/resendable) done.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-36';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-36', true, now());

-- End 360_roadmap_state_p0_36.
