-- 320_roadmap_state_p0_33.sql
-- Runs on BOTH databases. Marks Roadmap item p0-33 (post-review fixes
-- batch: cleaner assignment, KB structure, same-day checkin bug,
-- Management Invoice framing) done.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-33';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-33', true, now());

-- End 320_roadmap_state_p0_33.
